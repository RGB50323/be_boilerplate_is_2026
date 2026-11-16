import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaService } from '../dist/prisma/services/prisma.service.js';
import { ReservasClienteController } from '../dist/reservaciones/controllers/reservas-cliente.controller.js';
import { ReservacionesController } from '../dist/reservaciones/controllers/reservaciones.controller.js';
import { ReservacionesService } from '../dist/reservaciones/services/reservaciones.service.js';
import { ReservacionRepository } from '../dist/reservaciones/repositories/reservacion.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';

// Opt-in: ejecutar solo con una base temporal migrada. Nunca usa DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('H10 con PostgreSQL real', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let sucursalId: number;
  let mesaId: number;
  const usuarios = [randomUUID(), randomUUID()];
  const datos = {
    fecha: '2099-11-09',
    hora: '14:00',
    personas: 2,
    nombre: 'Cliente de prueba',
    telefono: '7123-4567',
    correo: 'h10@example.test',
  };
  beforeAll(async () => {
    if (!url || new URL(url).pathname !== '/h10_test')
      throw new Error('Usá una base temporal llamada h10_test.');
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    for (const id of usuarios)
      await prisma.user.create({
        data: { id, email: `${id}@example.test`, passwordHash: 'no-utilizado' },
      });
    const sucursal = await prisma.sucursal.create({
      data: {
        nombre: `H10-${randomUUID()}`,
        horarios: {
          create: Array.from({ length: 7 }, (_, diaSemana) => ({
            diaSemana,
            apertura: new Date('1970-01-01T08:00:00Z'),
            cierre: new Date('1970-01-01T23:00:00Z'),
          })),
        },
        mesas: { create: { numero: 1, capacidad: 4 } },
      },
      include: { mesas: true },
    });
    sucursalId = sucursal.id;
    mesaId = sucursal.mesas[0].id;
    const module = await Test.createTestingModule({
      controllers: [ReservasClienteController, ReservacionesController],
      providers: [
        ReservacionesService,
        ReservacionRepository,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuthService,
          useValue: {
            authenticateAccessToken: async (token: string) => {
              if (!usuarios.includes(token)) throw new UnauthorizedException();
              return { id: token };
            },
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ApiValidationPipe());
    await app.init();
  });
  beforeEach(async () => {
    await prisma.reservacion.deleteMany({ where: { mesaId } });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      if (mesaId) {
        await prisma.reservacion.deleteMany({ where: { mesaId } });
        await prisma.mesa.delete({ where: { id: mesaId } });
      }
      if (sucursalId)
        await prisma.sucursal.delete({ where: { id: sucursalId } });
      await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
      await prisma.$disconnect();
    }
  });
  const confirmar = (usuario = usuarios[0], cambios = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/reservaciones')
      .auth(usuario, { type: 'bearer' })
      .send({ ...datos, mesaId, ...cambios });

  it('dos clientes simultáneos obtienen exactamente un 201 y un 409', async () => {
    const respuestas = await Promise.all(
      usuarios.map((usuario) => confirmar(usuario)),
    );
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const guardadas = await prisma.reservacion.findMany({ where: { mesaId } });
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].clienteId).toBe(
      usuarios[respuestas.findIndex((r) => r.status === 201)],
    );
    expect(guardadas[0].fin.getTime() - guardadas[0].inicio.getTime()).toBe(
      120 * 60_000,
    );
  });
  it('rechaza un cruce parcial pero permite empezar cuando termina la anterior', async () => {
    await confirmar().expect(201);
    await confirmar(usuarios[1], { hora: '14:30' }).expect(409);
    await confirmar(usuarios[1], { hora: '16:00' }).expect(201);
  });
  it('una cancelada no bloquea la mesa', async () => {
    await confirmar().expect(201);
    await prisma.reservacion.updateMany({
      where: { mesaId },
      data: { estado: 'CANCELADA' },
    });
    await confirmar(usuarios[1]).expect(201);
  });
  it('H09 deja de mostrar la mesa confirmada', async () => {
    await confirmar().expect(201);
    const r = await request(app.getHttpServer())
      .get(`/api/v1/sucursales/${sucursalId}/mesas-disponibles`)
      .query({ fecha: datos.fecha, hora: datos.hora, personas: datos.personas })
      .expect(200);
    expect(r.body).toEqual([]);
  });
  it('el listado real aísla los datos de cada cuenta', async () => {
    await confirmar().expect(201);
    const mias = await request(app.getHttpServer())
      .get('/api/v1/reservaciones/mias')
      .auth(usuarios[0], { type: 'bearer' })
      .expect(200);
    const ajenas = await request(app.getHttpServer())
      .get('/api/v1/reservaciones/mias')
      .auth(usuarios[1], { type: 'bearer' })
      .expect(200);
    expect(mias.body.total).toBe(1);
    expect(mias.body.datos[0]).toMatchObject({
      fecha: datos.fecha,
      hora: datos.hora,
      estado: 'CONFIRMADA',
    });
    expect(ajenas.body).toMatchObject({ total: 0, datos: [] });
  });
});
