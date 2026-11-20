import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../dist/auth/auth.module.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../dist/auth/guards/roles.guard.js';
import { BeneficiosModule } from '../dist/beneficios/beneficios.module.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';
import {
  AccionLealtad,
  EntidadLealtad,
  Rol,
} from '../dist/generated/prisma/client.js';
import { PrismaModule } from '../dist/prisma/prisma.module.js';
import { PrismaService } from '../dist/prisma/services/prisma.service.js';
import { esDestinoLocal } from '../prisma/destinos-base.js';

const url = process.env.H20_REGLA_TEST_DATABASE_URL;
const ruta = '/api/v1/reglas-puntos/vigente';

describe.skipIf(!url)('H20 regla de acumulación en PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const usuarios = new Map<Rol, { id: string; token: string }>();

  beforeAll(async () => {
    if (
      !url ||
      !esDestinoLocal(url) ||
      new URL(url).pathname !== '/h20_regla_test'
    ) {
      throw new Error(
        'Usa exclusivamente una base local h20_regla_test recién migrada.',
      );
    }
    const jwtSecret = randomUUID();
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [
            () => ({
              DATABASE_URL: url,
              NODE_ENV: 'test',
              JWT_SECRET: jwtSecret,
              JWT_EXPIRES_IN: '15m',
              REFRESH_TOKEN_EXPIRES_IN_DAYS: 7,
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
        BeneficiosModule,
      ],
      providers: [
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
        { provide: APP_GUARD, useExisting: RolesGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ApiValidationPipe());
    prisma = modulo.get(PrismaService);
    await app.init();
    if (await prisma.reglaPuntos.count()) {
      throw new Error(
        'La prueba requiere una base aislada sin reglas previas.',
      );
    }

    const jwt = new JwtService({ secret: jwtSecret });
    for (const rol of Object.values(Rol)) {
      const { id } = await prisma.user.create({
        data: {
          rol,
          email: `${randomUUID()}@example.test`,
          passwordHash: 'fixture',
        },
      });
      usuarios.set(rol, { id, token: jwt.sign({ sub: id }) });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  function agente(rol: Rol, metodo: 'get' | 'put') {
    return request(app.getHttpServer() as Parameters<typeof request>[0])
      [metodo](ruta)
      .set('Authorization', `Bearer ${usuarios.get(rol)!.token}`);
  }

  it('restringe lectura y escritura a gerencia y valida el entero en ambos límites', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get(ruta)
      .expect(401);
    for (const rol of [Rol.CLIENTE, Rol.MESERO, Rol.COCINA]) {
      await agente(rol, 'get').expect(403);
      await agente(rol, 'put').send({ puntosPorDolar: 2 }).expect(403);
    }
    for (const valor of [0, 11, 1.5, '4', null]) {
      await agente(Rol.GERENTE, 'put')
        .send({ puntosPorDolar: valor })
        .expect(400);
    }
    await agente(Rol.GERENTE, 'put').send({}).expect(400);
    await agente(Rol.GERENTE, 'get').expect(200, { regla: null });
    await agente(Rol.GERENTE_GENERAL, 'get').expect(200, { regla: null });
  });

  it('serializa la primera regla y las modificaciones conservando reglas y auditoría', async () => {
    const roles = [Rol.GERENTE, Rol.GERENTE_GENERAL] as const;
    await Promise.all(
      roles.map((rol) =>
        agente(rol, 'put').send({ puntosPorDolar: 1 }).expect(200),
      ),
    );
    const primera = await prisma.reglaPuntos.findFirstOrThrow({
      where: { activa: true },
    });
    expect(await prisma.reglaPuntos.count()).toBe(1);
    expect(primera.puntosPorDolar).toBe(1);

    await agente(Rol.GERENTE_GENERAL, 'put')
      .send({ puntosPorDolar: 10 })
      .expect(200);
    const segunda = await prisma.reglaPuntos.findFirstOrThrow({
      where: { activa: true },
    });
    await agente(Rol.GERENTE, 'get').expect(200, {
      regla: {
        id: segunda.id,
        puntosPorDolar: 10,
        vigenteDesde: segunda.vigenteDesde.toISOString(),
      },
    });
    await agente(Rol.GERENTE, 'put').send({ puntosPorDolar: 10 }).expect(200);
    const anterior = await prisma.reglaPuntos.findUniqueOrThrow({
      where: { id: primera.id },
    });
    expect(anterior).toMatchObject({
      activa: false,
      puntosPorDolar: 1,
      deshabilitadaEn: segunda.vigenteDesde,
    });

    await Promise.all(
      roles.map((rol, indice) =>
        agente(rol, 'put')
          .send({ puntosPorDolar: 5 + indice })
          .expect(200),
      ),
    );
    expect(await prisma.reglaPuntos.count({ where: { activa: true } })).toBe(1);
    expect(await prisma.reglaPuntos.count()).toBe(4);
    const historial = await prisma.historialLealtad.findMany({
      where: { entidad: EntidadLealtad.REGLA },
      orderBy: { id: 'asc' },
    });
    expect(historial).toHaveLength(4);
    expect(historial[0]).toMatchObject({
      entidadId: primera.id,
      accion: AccionLealtad.CREACION,
      valorAnterior: null,
    });
    expect(historial[1]).toMatchObject({
      entidadId: segunda.id,
      accion: AccionLealtad.MODIFICACION,
      usuarioId: usuarios.get(Rol.GERENTE_GENERAL)!.id,
      valorAnterior: { id: primera.id, puntosPorDolar: 1 },
      valorNuevo: { id: segunda.id, puntosPorDolar: 10 },
    });
    await expect(
      prisma.reglaPuntos.create({ data: { puntosPorDolar: 9 } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
