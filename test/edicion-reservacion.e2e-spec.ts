import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaService } from '../dist/prisma/services/prisma.service.js';
import { EdicionReservacionController } from '../dist/reservaciones/controllers/edicion-reservacion.controller.js';
import { EdicionReservacionService } from '../dist/reservaciones/services/edicion-reservacion.service.js';
import { ReservacionRepository } from '../dist/reservaciones/repositories/reservacion.repository.js';
import { ReservasClienteController } from '../dist/reservaciones/controllers/reservas-cliente.controller.js';
import { ReservacionesService } from '../dist/reservaciones/services/reservaciones.service.js';
import { EdicionReservacionRepository } from '../dist/reservaciones/repositories/edicion-reservacion.repository.js';
import { NotificacionesService } from '../dist/notificaciones/services/notificaciones.service.js';
import { NotificacionRepository } from '../dist/notificaciones/repositories/notificacion.repository.js';
import { AvisosReservacionService } from '../dist/reservaciones/services/avisos-reservacion.service.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';
import { urlPruebaTemporal } from '../prisma/destinos-base.js';

// Corre en su base temporal h11_test: `npm run test:e2e` (proyecto h11 de vitest.config.e2e.ts) la crea, la migra y fija TEST_DATABASE_URL.
// Si TEST_DATABASE_URL apunta a un servidor que no es local, falla antes de tocar nada. Sola: npm run test:h11.
const url = urlPruebaTemporal('h11', process.env);
describe.skipIf(!url)('H11 con PostgreSQL real', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let sucursalId: number;
  let mesas: number[];
  let reservaId: number;
  let version: string;
  let avisos: NotificacionesService;
  const usuarios = [randomUUID(), randomUUID()];
  const fecha = '2099-11-09';
  const base = { fecha, hora: '14:00', personas: 2 };
  const ruta = () => '/reservaciones/R-' + String(reservaId).padStart(6, '0');
  const datos = () => ({ ...base, mesaId: mesas[0], version });
  const patch = (cambios = {}, usuario = usuarios[0]) =>
    request(app.getHttpServer())
      .patch(ruta())
      .auth(usuario, { type: 'bearer' })
      .send({ ...datos(), ...cambios });
  const crear = (mesaId: number, hora: string, clienteId = usuarios[0]) =>
    prisma.reservacion.create({
      data: {
        mesaId,
        clienteId,
        nombre: 'Prueba H11',
        telefono: '7123-4567',
        correo: 'h11@example.test',
        personas: 2,
        inicio: new Date(fecha + 'T' + hora + ':00-06:00'),
        fin: new Date(
          new Date(fecha + 'T' + hora + ':00-06:00').getTime() + 7200000,
        ),
      },
    });
  beforeAll(async () => {
    if (!url || new URL(url).pathname !== '/h11_test')
      throw new Error('Usá una base temporal llamada h11_test.');
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 1 }),
    });
    for (const id of usuarios)
      await prisma.user.create({
        data: {
          id,
          email: id + '@example.test',
          passwordHash: 'no-utilizado',
        },
      });
    const sucursal = await prisma.sucursal.create({
      data: {
        nombre: 'H11-' + randomUUID(),
        horarios: {
          create: Array.from({ length: 7 }, (_, diaSemana) => ({
            diaSemana,
            apertura: new Date('1970-01-01T08:00:00Z'),
            cierre: new Date('1970-01-01T23:00:00Z'),
          })),
        },
        mesas: {
          create: [1, 2, 3].map((numero) => ({ numero, capacidad: 4 })),
        },
      },
      include: { mesas: { orderBy: { numero: 'asc' } } },
    });
    sucursalId = sucursal.id;
    mesas = sucursal.mesas.map((m) => m.id);
    avisos = new NotificacionesService(
      new NotificacionRepository(prisma as never),
      { enviar: async () => {} } as never,
      async () => {},
      0,
    );
    const module = await Test.createTestingModule({
      controllers: [EdicionReservacionController, ReservasClienteController],
      providers: [
        EdicionReservacionService,
        ReservacionRepository,
        ReservacionesService,
        EdicionReservacionRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificacionesService, useValue: avisos },
        AvisosReservacionService,
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
    app.useGlobalPipes(new ApiValidationPipe());
    await app.init();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await prisma.notificacion.deleteMany({
      where: { destinatarioId: { in: usuarios } },
    });
    await prisma.reservacion.deleteMany({ where: { mesaId: { in: mesas } } });
    const reserva = await crear(mesas[0], '14:00');
    reservaId = reserva.id;
    version = reserva.creadaEn.toISOString();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.notificacion.deleteMany({
        where: { destinatarioId: { in: usuarios } },
      });
      if (mesas) {
        await prisma.reservacion.deleteMany({
          where: { mesaId: { in: mesas } },
        });
        await prisma.mesa.deleteMany({ where: { id: { in: mesas } } });
      }
      if (sucursalId)
        await prisma.sucursal.delete({ where: { id: sucursalId } });
      await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
      await prisma.$disconnect();
    }
  });
  it('consulta detalle, modifica sin chocarse consigo misma y registra un aviso por cambio', async () => {
    const detalle = await request(app.getHttpServer())
      .get(ruta())
      .auth(usuarios[0], { type: 'bearer' })
      .expect(200);
    expect(detalle.body).toMatchObject({ ...base, version, capacidad: 4 });
    const r = await patch({ hora: '14:30', personas: 3 }).expect(200);
    expect(r.body).toMatchObject({
      hora: '14:30',
      personas: 3,
      estado: 'CONFIRMADA',
    });
    expect(r.body.modificadaEn).not.toBeNull();
    version = r.body.version;
    await patch({ hora: '15:00' }).expect(200);
    const notificaciones = await prisma.notificacion.findMany({
      where: { destinatarioId: usuarios[0] },
    });
    expect(notificaciones).toHaveLength(2);
    expect(notificaciones.some((n) => n.mensaje.includes('15:00'))).toBe(true);
    // H26: formato común y correo enviado después del commit
    expect(
      notificaciones.every((n) => n.referenciaTipo === 'RESERVA_MODIFICADA'),
    ).toBe(true);
    await vi.waitFor(async () => {
      const correos = await prisma.notificacion.findMany({
        where: { destinatarioId: usuarios[0] },
        select: { estadoCorreo: true },
      });
      expect(correos.every((c) => c.estadoCorreo === 'ENVIADO')).toBe(true);
    });
  });
  it('conserva versión y no avisa cuando se guarda sin cambios', async () => {
    const respuesta = await patch().expect(200);
    expect(respuesta.body.version).toBe(version);
    expect(respuesta.body.modificadaEn).toBeNull();
    await patch().expect(200);
    expect(
      await prisma.notificacion.count({
        where: { destinatarioId: usuarios[0] },
      }),
    ).toBe(0);
  });
  it('mias funciona con el controlador dinámico registrado primero', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/reservaciones/mias')
      .auth(usuarios[0], { type: 'bearer' })
      .expect(200);
    expect(respuesta.body.total).toBe(1);
  });
  it('requiere sesión y oculta las reservaciones ajenas', async () => {
    await request(app.getHttpServer()).patch(ruta()).send(datos()).expect(401);
    await patch({}, usuarios[1]).expect(404);
    await request(app.getHttpServer())
      .get(ruta())
      .auth(usuarios[1], { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(ruta() + '/mesas-disponibles')
      .auth(usuarios[1], { type: 'bearer' })
      .query(base)
      .expect(404);
  });
  it('rechaza canceladas, capacidad, pasado, fuera de horario y campos extra', async () => {
    for (const cambio of [
      { personas: 5 },
      { personas: 0 },
      { fecha: '2000-01-01' },
      { hora: '22:00' },
      { hora: '14:15' },
      { clienteId: usuarios[1] },
    ])
      await patch(cambio).expect(400);
    await prisma.reservacion.update({
      where: { id: reservaId },
      data: { estado: 'CANCELADA' },
    });
    await patch().expect(400);
  });
  it('un conflicto conserva la reserva y devuelve alternativas que excluyen solo su propio intervalo', async () => {
    await crear(mesas[0], '17:00', usuarios[1]);
    await patch({ hora: '17:00' }).expect(409);
    const original = await prisma.reservacion.findUniqueOrThrow({
      where: { id: reservaId },
    });
    expect(original.inicio.toISOString()).toContain('20:00:00');
    expect(original.modificadaEn).toBeNull();
    const alternativas = await request(app.getHttpServer())
      .get(ruta() + '/mesas-disponibles')
      .auth(usuarios[0], { type: 'bearer' })
      .query({ ...base, hora: '17:00' })
      .expect(200);
    expect(alternativas.body.map((m: { mesaId: number }) => m.mesaId)).toEqual([
      mesas[1],
      mesas[2],
    ]);
    await patch({ hora: '17:00', mesaId: mesas[1] }).expect(200);
  });
  it('dos ediciones sobre la misma versión producen un éxito y un conflicto', async () => {
    const respuestas = await Promise.all([
      patch({ hora: '16:00' }),
      patch({ hora: '18:00' }),
    ]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(respuestas.find((r) => r.status === 409)?.body.codigo).toBe(
      'RESERVA_MODIFICADA',
    );
  });
  it('dos reservas que compiten por la misma mesa y horario solo guardan una', async () => {
    const otra = await crear(mesas[1], '14:00', usuarios[1]);
    const respuestas = await Promise.all([
      patch({ mesaId: mesas[2], hora: '17:00' }),
      request(app.getHttpServer())
        .patch('/reservaciones/R-' + otra.id)
        .auth(usuarios[1], { type: 'bearer' })
        .send({
          ...base,
          hora: '17:00',
          mesaId: mesas[2],
          version: otra.creadaEn.toISOString(),
        }),
    ]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(
      await prisma.reservacion.count({ where: { mesaId: mesas[2] } }),
    ).toBe(1);
    expect(
      await prisma.notificacion.count({
        where: { destinatarioId: { in: usuarios } },
      }),
    ).toBe(1);
  });
  it('impide mover una reserva ya iniciada a una fecha futura', async () => {
    const inicio = new Date(Date.now() - 60_000);
    await prisma.reservacion.update({
      where: { id: reservaId },
      data: {
        inicio,
        fin: new Date(inicio.getTime() + 7_200_000),
      },
    });
    const respuesta = await patch().expect(400);
    expect(respuesta.body.message).toContain('todavía no haya comenzado');
    await request(app.getHttpServer())
      .get(ruta() + '/mesas-disponibles')
      .auth(usuarios[0], { type: 'bearer' })
      .query(base)
      .expect(400);
    const original = await prisma.reservacion.findUniqueOrThrow({
      where: { id: reservaId },
    });
    expect(original.inicio).toEqual(inicio);
    expect(original.modificadaEn).toBeNull();
  });
  it('si falla el servicio de avisos revierte la modificación', async () => {
    vi.spyOn(avisos, 'notificar').mockRejectedValueOnce(
      new Error('Fallo simulado'),
    );
    await patch({ hora: '18:00' }).expect(500);
    const original = await prisma.reservacion.findUniqueOrThrow({
      where: { id: reservaId },
    });
    expect(original.modificadaEn).toBeNull();
    expect(original.inicio.toISOString()).toContain('20:00:00');
  });
});
