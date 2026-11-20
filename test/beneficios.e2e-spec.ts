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
import { Rol } from '../dist/generated/prisma/client.js';
import { PrismaModule } from '../dist/prisma/prisma.module.js';
import { PrismaService } from '../dist/prisma/services/prisma.service.js';
import { esDestinoLocal } from '../prisma/destinos-base.js';

const url = process.env.H20_TEST_DATABASE_URL;
const ruta = '/api/v1/beneficios';
const marca = randomUUID();
const roles = [
  Rol.GERENTE,
  Rol.GERENTE_GENERAL,
  Rol.CLIENTE,
  Rol.MESERO,
  Rol.COCINA,
];

describe.skipIf(!url)('H20 administración de beneficios en PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const usuarios = new Map<Rol, { id: string; token: string }>();
  const sucursales: number[] = [];
  const platillos: number[] = [];
  const beneficios: number[] = [];
  let categoriaId: number | undefined;

  beforeAll(async () => {
    if (!url || !esDestinoLocal(url) || new URL(url).pathname !== '/h20_test') {
      throw new Error(
        'H20_TEST_DATABASE_URL debe apuntar exclusivamente a h20_test local.',
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
    const [destino] = await prisma.$queryRaw<
      { base: string }[]
    >`SELECT current_database() AS base`;
    if (destino.base !== 'h20_test')
      throw new Error('La conexión de Prisma no apunta a h20_test.');
    await app.init();

    for (const sufijo of ['A', 'B']) {
      const sucursal = await prisma.sucursal.create({
        data: {
          nombre: `H20 ${sufijo} ${marca}`,
          direccion: 'Dirección de prueba',
        },
      });
      sucursales.push(sucursal.id);
    }
    const jwt = new JwtService({ secret: jwtSecret });
    for (const rol of roles) {
      const usuario = await prisma.user.create({
        data: {
          rol,
          email: `${marca}-${rol}@example.test`,
          passwordHash: 'fixture',
          sucursalId: rol === Rol.GERENTE ? sucursales[0] : null,
        },
      });
      usuarios.set(rol, {
        id: usuario.id,
        token: jwt.sign({ sub: usuario.id }),
      });
    }
    categoriaId = (
      await prisma.categoria.create({ data: { nombre: `H20 ${marca}` } })
    ).id;
    for (const sufijo of ['A', 'B']) {
      const plato = await prisma.platillo.create({
        data: {
          categoriaId,
          nombre: `H20 ${marca} ${sufijo}`,
          descripcion: `Descripción ${sufijo}`,
        },
      });
      platillos.push(plato.id);
    }
    await prisma.platilloSucursal.create({
      data: {
        platilloId: platillos[0],
        sucursalId: sucursales[1],
        precio: 5,
        disponibilidad: 1,
      },
    });
  }, 20_000);

  afterAll(async () => {
    if (!app) return;
    try {
      await prisma.canje.deleteMany({
        where: { beneficioId: { in: beneficios } },
      });
      await prisma.beneficio.deleteMany({ where: { id: { in: beneficios } } });
      await prisma.platillo.deleteMany({ where: { id: { in: platillos } } });
      if (categoriaId)
        await prisma.categoria.delete({ where: { id: categoriaId } });
      await prisma.user.deleteMany({
        where: { id: { in: [...usuarios.values()].map(({ id }) => id) } },
      });
      await prisma.sucursal.deleteMany({ where: { id: { in: sucursales } } });
    } finally {
      await app.close();
    }
  });

  const cliente = () => request(app.getHttpServer());
  const autorizar = (rol: Rol = Rol.GERENTE) =>
    `Bearer ${usuarios.get(rol)!.token}`;
  const datos = () => ({
    platilloId: platillos[0],
    costoPuntos: 150,
    vigenteDesde: '2026-11-25',
    vigenteHasta: '2026-11-25',
  });

  async function crear(rol: Rol = Rol.GERENTE) {
    const res = await cliente()
      .post(ruta)
      .set('Authorization', autorizar(rol))
      .send(datos())
      .expect(201);
    const id = Number(res.body.id);
    beneficios.push(id);
    return { id, body: res.body as Record<string, unknown> };
  }

  it('aplica JWT y la lista de roles a los seis endpoints', async () => {
    const consultas = () => [
      cliente().get(ruta),
      cliente().get(`${ruta}/platillos`),
      cliente().get(`${ruta}/1`),
      cliente().post(ruta).send(datos()),
      cliente().patch(`${ruta}/1`).send({ costoPuntos: 100 }),
      cliente().patch(`${ruta}/1/deshabilitar`),
    ];
    await Promise.all(consultas().map((peticion) => peticion.expect(401)));
    for (const rol of [Rol.CLIENTE, Rol.MESERO, Rol.COCINA]) {
      await Promise.all(
        consultas().map((peticion) =>
          peticion.set('Authorization', autorizar(rol)).expect(403),
        ),
      );
    }
  });

  it.each([Rol.GERENTE, Rol.GERENTE_GENERAL])(
    'permite a %s operar sobre el mismo catálogo global',
    async (rol) => {
      const auth = autorizar(rol);
      const otro = rol === Rol.GERENTE ? Rol.GERENTE_GENERAL : Rol.GERENTE;
      const seleccion = await cliente()
        .get(`${ruta}/platillos`)
        .query({ buscar: marca })
        .set('Authorization', auth)
        .expect(200);
      expect(seleccion.body.datos).toEqual([
        {
          id: platillos[0],
          nombre: `H20 ${marca} A`,
          descripcion: 'Descripción A',
        },
        {
          id: platillos[1],
          nombre: `H20 ${marca} B`,
          descripcion: 'Descripción B',
        },
      ]);
      const { id, body } = await crear(rol);
      expect(body).toMatchObject({
        ...datos(),
        nombre: `H20 ${marca} A`,
        descripcion: 'Descripción A',
        deshabilitadoEn: null,
      });
      const guardado = await prisma.beneficio.findUniqueOrThrow({
        where: { id },
      });
      expect(guardado.vigenteDesde.toISOString()).toBe(
        '2026-11-25T06:00:00.000Z',
      );
      expect(guardado.vigenteHasta.toISOString()).toBe(
        '2026-11-26T06:00:00.000Z',
      );
      const listado = await cliente()
        .get(ruta)
        .set('Authorization', autorizar(otro))
        .expect(200);
      expect(listado.body.datos).toEqual(
        expect.arrayContaining([expect.objectContaining({ id })]),
      );
      await cliente()
        .get(`${ruta}/${id}`)
        .set('Authorization', auth)
        .expect(200);
      await cliente()
        .patch(`${ruta}/${id}`)
        .set('Authorization', auth)
        .send({ costoPuntos: 175 })
        .expect(200);
      await cliente()
        .patch(`${ruta}/${id}/deshabilitar`)
        .set('Authorization', auth)
        .expect(200);
    },
  );

  it('rechaza tipos inesperados, días inválidos, campos protegidos e IDs inválidos', async () => {
    const auth = autorizar();
    const { id } = await crear();
    await cliente().post(ruta).set('Authorization', auth).send([]).expect(400);
    for (const invalido of [
      { costoPuntos: 0 },
      { costoPuntos: -1 },
      { costoPuntos: 1.3 },
      { costoPuntos: '150' },
      { platilloId: 0 },
      { platilloId: null },
      { vigenteDesde: null },
      { vigenteHasta: null },
      { vigenteDesde: '2026-02-30' },
      { vigenteDesde: '2026-1-01' },
      { vigenteDesde: '2026-11-25\n' },
      { vigenteDesde: 20261125 },
      { vigenteHasta: '2026-11-24' },
      { activo: true },
      { nombre: 'Otro' },
      { descripcion: 'Otra' },
      { deshabilitadoEn: null },
    ]) {
      await cliente()
        .post(ruta)
        .set('Authorization', auth)
        .send({ ...datos(), ...invalido })
        .expect(400);
    }
    for (const invalido of [
      {},
      { costoPuntos: null },
      { platilloId: null },
      { vigenteHasta: null },
      { modificadoEn: null },
      { deshabilitadoEn: null },
    ]) {
      await cliente()
        .patch(`${ruta}/${id}`)
        .set('Authorization', auth)
        .send(invalido)
        .expect(400);
    }
    for (const invalido of ['0', '-1', '1.5', '2147483648']) {
      await cliente()
        .get(`${ruta}/${invalido}`)
        .set('Authorization', auth)
        .expect(400);
    }
    await cliente()
      .get(ruta)
      .query({ estado: 'activos' })
      .set('Authorization', auth)
      .expect(400);
    await cliente()
      .get(ruta)
      .query({ pagina: 0 })
      .set('Authorization', auth)
      .expect(400);
    await cliente()
      .get(`${ruta}/2147483647`)
      .set('Authorization', auth)
      .expect(404);
    await cliente()
      .post(ruta)
      .set('Authorization', auth)
      .send({ ...datos(), platilloId: 2147483647 })
      .expect(404);
    await cliente()
      .patch(`${ruta}/${id}`)
      .set('Authorization', auth)
      .send({ platilloId: 2147483647 })
      .expect(404);
  });

  it('clasifica y filtra estados con la misma prioridad, incluido el historial sin platillo', async () => {
    const grupos = [
      { estado: 'PROGRAMADO', desde: '2098-01-01', hasta: '2099-01-01' },
      { estado: 'VIGENTE', desde: '2000-01-01', hasta: '2099-01-01' },
      { estado: 'VENCIDO', desde: '2000-01-01', hasta: '2001-01-01' },
      {
        estado: 'SIN_PLATILLO',
        desde: '2000-01-01',
        hasta: '2001-01-01',
        sinPlatillo: true,
      },
      {
        estado: 'DESHABILITADO',
        desde: '2098-01-01',
        hasta: '2099-01-01',
        sinPlatillo: true,
      },
    ];
    for (const grupo of grupos) {
      const { id } = await prisma.beneficio.create({
        data: {
          costoPuntos: 150,
          platilloId: grupo.sinPlatillo ? null : platillos[0],
          vigenteDesde: new Date(grupo.desde),
          vigenteHasta: new Date(grupo.hasta),
          deshabilitadoEn: grupo.estado === 'DESHABILITADO' ? new Date() : null,
        },
      });
      beneficios.push(id);
      const detalle = await cliente()
        .get(`${ruta}/${id}`)
        .set('Authorization', autorizar())
        .expect(200);
      expect(detalle.body.estado).toBe(grupo.estado);
      if (grupo.sinPlatillo)
        expect(detalle.body).toMatchObject({
          platilloId: null,
          nombre: null,
          descripcion: null,
          platillo: null,
        });
      const lista = await cliente()
        .get(ruta)
        .query({ estado: grupo.estado })
        .set('Authorization', autorizar())
        .expect(200);
      expect(lista.body.datos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id, estado: grupo.estado }),
        ]),
      );
      expect(
        lista.body.datos.every(
          ({ estado }: { estado: string }) => estado === grupo.estado,
        ),
      ).toBe(true);
    }
  });

  it('edita asociación y vigencia sin alterar los canjes y conserva el registro tras la baja', async () => {
    const { id } = await crear();
    const canje = await prisma.canje.create({
      data: {
        beneficioId: id,
        clienteId: usuarios.get(Rol.CLIENTE)!.id,
        nombreBeneficio: 'Nombre histórico',
        puntosUsados: 150,
        codigo: randomUUID().slice(0, 20),
      },
    });
    const auth = autorizar(Rol.GERENTE_GENERAL);
    await cliente()
      .patch(`${ruta}/${id}`)
      .set('Authorization', auth)
      .send({ vigenteDesde: '2026-11-26' })
      .expect(400);
    const editado = await cliente()
      .patch(`${ruta}/${id}`)
      .set('Authorization', auth)
      .send({
        platilloId: platillos[1],
        costoPuntos: 300,
        vigenteHasta: '2026-11-30',
      })
      .expect(200);
    expect(editado.body).toMatchObject({
      platilloId: platillos[1],
      descripcion: 'Descripción B',
      costoPuntos: 300,
      vigenteDesde: '2026-11-25',
      vigenteHasta: '2026-11-30',
      modificadoEn: expect.any(String),
    });
    const baja = await cliente()
      .patch(`${ruta}/${id}/deshabilitar`)
      .set('Authorization', auth)
      .expect(200);
    await cliente()
      .patch(`${ruta}/${id}/deshabilitar`)
      .set('Authorization', auth)
      .expect(409);
    await cliente()
      .patch(`${ruta}/${id}`)
      .set('Authorization', auth)
      .send({ costoPuntos: 10 })
      .expect(409);
    await cliente()
      .patch(`${ruta}/${id}/reactivar`)
      .set('Authorization', auth)
      .expect(404);
    const lectura = await cliente()
      .get(`${ruta}/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(lectura.body).toMatchObject({
      estado: 'DESHABILITADO',
      deshabilitadoEn: baja.body.deshabilitadoEn,
      costoPuntos: 300,
    });
    expect(await prisma.canje.findUnique({ where: { id: canje.id } })).toEqual(
      canje,
    );
  });

  it('serializa dos bajas simultáneas y una edición concurrente con la baja', async () => {
    const { id } = await crear();
    const baja = (beneficioId: number, rol: Rol) =>
      cliente()
        .patch(`${ruta}/${beneficioId}/deshabilitar`)
        .set('Authorization', autorizar(rol));
    const editar = (beneficioId: number) =>
      cliente()
        .patch(`${ruta}/${beneficioId}`)
        .set('Authorization', autorizar(Rol.GERENTE_GENERAL))
        .send({ costoPuntos: 999 });
    const dosBajas = await Promise.all([
      baja(id, Rol.GERENTE),
      baja(id, Rol.GERENTE_GENERAL),
    ]);
    expect(dosBajas.map(({ status }) => status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);

    const carrera = await crear();
    const [deshabilitado, cambio] = await Promise.all([
      baja(carrera.id, Rol.GERENTE),
      editar(carrera.id),
    ]);
    expect(deshabilitado.status).toBe(200);
    expect([200, 409]).toContain(cambio.status);
    const final = await prisma.beneficio.findUniqueOrThrow({
      where: { id: carrera.id },
    });
    expect(final.costoPuntos).toBe(cambio.status === 200 ? 999 : 150);
    expect(deshabilitado.body.costoPuntos).toBe(final.costoPuntos);
    expect(final.deshabilitadoEn?.toISOString()).toBe(
      deshabilitado.body.deshabilitadoEn,
    );
    await editar(carrera.id).expect(409);
  });
});
