import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ReservasClienteController } from '../dist/reservaciones/controllers/reservas-cliente.controller.js';
import { ReservacionesService } from '../dist/reservaciones/services/reservaciones.service.js';
import { ReservacionRepository } from '../dist/reservaciones/repositories/reservacion.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';

const repo = {
  findMesaConHorario: vi.fn(),
  crearConfirmada: vi.fn(),
  listarPorCliente: vi.fn(),
};
const datos = {
  mesaId: 3,
  fecha: '2030-11-09',
  hora: '19:00',
  personas: 4,
  nombre: ' Ana López ',
  telefono: '7123-4567',
  correo: 'ana@correo.com',
};
const reserva = {
  id: 45,
  mesaId: 3,
  inicio: new Date('2030-11-10T01:00:00Z'),
  estado: 'CONFIRMADA',
  personas: 4,
  mesa: { numero: 2, sucursalId: 8, sucursal: { nombre: 'Centro' } },
};
let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ReservasClienteController],
    providers: [
      ReservacionesService,
      { provide: ReservacionRepository, useValue: repo },
      {
        provide: AuthService,
        useValue: {
          authenticateAccessToken: async (token: string) => {
            if (!['cliente-a', 'cliente-b'].includes(token))
              throw new UnauthorizedException();
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
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-11-01T12:00:00Z'));
  repo.findMesaConHorario.mockResolvedValue({
    id: 3,
    activa: true,
    capacidad: 4,
    sucursal: {
      horarios: [
        {
          apertura: new Date('1970-01-01T08:00:00Z'),
          cierre: new Date('1970-01-01T21:00:00Z'),
        },
      ],
    },
  });
  repo.crearConfirmada.mockResolvedValue(reserva);
  repo.listarPorCliente.mockResolvedValue([[reserva], 1]);
});
afterEach(() => vi.useRealTimers());
const confirmar = (cambios = {}) =>
  request(app.getHttpServer())
    .post('/api/v1/reservaciones')
    .auth('cliente-a', { type: 'bearer' })
    .send({ ...datos, ...cambios });

it('201 asocia la sesión, recorta contacto y devuelve identificador y horario local', async () => {
  const r = await confirmar().expect(201);
  expect(r.body).toEqual({
    reservacionId: 'R-000045',
    estado: 'CONFIRMADA',
    mesaId: 3,
    mesa: 2,
    sucursalId: 8,
    sucursal: 'Centro',
    fecha: datos.fecha,
    hora: datos.hora,
    personas: 4,
  });
  expect(repo.crearConfirmada).toHaveBeenCalledWith(
    expect.objectContaining({
      clienteId: 'cliente-a',
      nombre: 'Ana López',
      inicio: new Date('2030-11-10T01:00:00Z'),
      fin: new Date('2030-11-10T03:00:00Z'),
    }),
  );
});
it.each([
  ['nombre', ' '],
  ['telefono', '12345678'],
  ['correo', 'no-valido'],
  ['personas', 0],
  ['personas', 5],
  ['fecha', '2030-02-30'],
  ['fecha', '2020-11-01'],
  ['hora', '19:15'],
  ['hora', '20:00'],
  ['mesaId', 0],
])('400 indica el campo %s', async (campo, valor) => {
  const r = await confirmar({ [campo]: valor }).expect(400);
  expect(r.body.errores[campo]).toBeTruthy();
  expect(repo.crearConfirmada).not.toHaveBeenCalled();
});
it.each(['clienteId', 'cliente_id'])(
  'rechaza el intento de enviar %s',
  async (campo) => {
    await confirmar({ [campo]: 'cliente-b' }).expect(400);
    expect(repo.crearConfirmada).not.toHaveBeenCalled();
  },
);
it('401 protege tanto confirmar como listar', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/reservaciones')
    .send(datos)
    .expect(401);
  await request(app.getHttpServer())
    .get('/api/v1/reservaciones/mias')
    .expect(401);
  await request(app.getHttpServer())
    .post('/api/v1/reservaciones')
    .auth('expirado', { type: 'bearer' })
    .send(datos)
    .expect(401);
});
it.each([null, { activa: false }])(
  '404 para mesa inexistente o inactiva',
  async (mesa) => {
    repo.findMesaConHorario.mockResolvedValue(mesa);
    await confirmar().expect(404);
  },
);
it('409 cuando PostgreSQL rechaza el solapamiento', async () => {
  repo.crearConfirmada.mockResolvedValue(null);
  const r = await confirmar().expect(409);
  expect(r.body.message).toContain('Elegí otra mesa');
});
it('lista únicamente usando el usuario autenticado y pagina', async () => {
  const r = await request(app.getHttpServer())
    .get('/api/v1/reservaciones/mias?pagina=2')
    .auth('cliente-b', { type: 'bearer' })
    .expect(200);
  expect(repo.listarPorCliente).toHaveBeenCalledWith('cliente-b', 2, 10);
  expect(r.body.datos[0]).not.toHaveProperty('correo');
  expect(r.headers['cache-control']).toBe('no-store');
});
it('rechaza páginas inválidas y filtros de otro cliente', async () => {
  for (const query of ['pagina=0', 'clienteId=cliente-b']) {
    await request(app.getHttpServer())
      .get(`/api/v1/reservaciones/mias?${query}`)
      .auth('cliente-a', { type: 'bearer' })
      .expect(400);
  }
});
