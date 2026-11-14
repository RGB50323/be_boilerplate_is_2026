import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
// Se prueba el artefacto compilado para conservar metadata de los decoradores de Nest.
import { ReservacionesController } from '../dist/reservaciones/controllers/reservaciones.controller.js';
import { ReservacionesService } from '../dist/reservaciones/services/reservaciones.service.js';
import { ReservacionRepository } from '../dist/reservaciones/repositories/reservacion.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';
const hora = (value: string) => new Date(`1970-01-01T${value}:00Z`);
const repo = {
  findSucursalesConHorarios: vi.fn(),
  findSucursalConHorario: vi.fn(),
  findMesasDisponibles: vi.fn(),
};
const verificarToken = vi.fn();
let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ReservacionesController],
    providers: [
      ReservacionesService,
      { provide: ReservacionRepository, useValue: repo },
      {
        provide: AuthService,
        useValue: { authenticateAccessToken: verificarToken },
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
  // Solo se congela Date; los temporizadores de HTTP continúan funcionando.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  repo.findSucursalConHorario.mockResolvedValue({
    id: 8,
    horarios: [{ apertura: hora('08:00'), cierre: hora('21:00') }],
  });
  repo.findMesasDisponibles.mockResolvedValue([
    { id: 3, numero: 3, capacidad: 4, zona: 'Salón' },
  ]);
  repo.findSucursalesConHorarios.mockResolvedValue([
    {
      id: 8,
      nombre: 'Centro',
      horarios: [
        { diaSemana: 1, apertura: hora('08:00'), cierre: hora('21:00') },
      ],
    },
  ]);
});
afterEach(() => vi.useRealTimers());
function consultar(query = {}, id = '8') {
  return request(app.getHttpServer())
    .get(`/api/v1/sucursales/${id}/mesas-disponibles`)
    .query({ fecha: '2026-11-09', hora: '19:00', personas: 4, ...query });
}
it('GET sucursales es público y conserva los horarios locales', async () => {
  const r = await request(app.getHttpServer())
    .get('/api/v1/sucursales')
    .expect(200);
  expect(r.body).toEqual([
    {
      id: 8,
      nombre: 'Centro',
      horarios: [{ diaSemana: 1, apertura: '08:00', cierre: '21:00' }],
    },
  ]);
  expect(r.headers['cache-control']).toBe('no-store');
  expect(verificarToken).not.toHaveBeenCalled();
});
it('GET disponibilidad es público, usa el ID real y calcula 2 horas en El Salvador', async () => {
  const r = await consultar().expect(200);
  expect(r.body).toEqual([
    { mesaId: 3, numero: 3, capacidad: 4, zona: 'Salón' },
  ]);
  expect(repo.findMesasDisponibles).toHaveBeenCalledWith({
    sucursalId: 8,
    personas: 4,
    inicio: new Date('2026-11-10T01:00:00Z'),
    fin: new Date('2026-11-10T03:00:00Z'),
  });
  expect(verificarToken).not.toHaveBeenCalled();
});
it('sin coincidencias devuelve []', async () => {
  repo.findMesasDisponibles.mockResolvedValue([]);
  expect((await consultar().expect(200)).body).toEqual([]);
});
it.each([
  ['personas', 0],
  ['personas', -1],
  ['personas', 1.5],
  ['personas', 2147483648],
  ['personas', ''],
  ['fecha', '2026-02-30'],
  ['fecha', ''],
  ['hora', '19:15'],
  ['hora', '25:00'],
])('400 identifica %s=%s', async (campo, valor) => {
  const r = await consultar({ [campo]: valor }).expect(400);
  expect(r.body.errores[campo]).toBeTruthy();
  expect(r.body.message).toBeDefined();
  expect(repo.findMesasDisponibles).not.toHaveBeenCalled();
});
it('400 identifica id de ruta inválido', async () => {
  const r = await consultar({}, 'abc').expect(400);
  expect(r.body.errores.id).toBeTruthy();
});
it('rechaza parámetros extra', async () => {
  const r = await consultar({ clienteId: 'otro' }).expect(400);
  expect(r.body.errores.clienteId).toBeTruthy();
});
it('404 identifica sucursal inexistente', async () => {
  repo.findSucursalConHorario.mockResolvedValue(null);
  const r = await consultar().expect(404);
  expect(r.body.errores.sucursalId).toBeTruthy();
});
it('400 informa fecha y hora pasadas', async () => {
  const r = await consultar({ fecha: '2026-11-06' }).expect(400);
  expect(r.body.errores.fecha).toContain('Horario no válido');
  expect(r.body.errores.hora).toContain('Horario no válido');
});
it('400 informa un día sin atención', async () => {
  repo.findSucursalConHorario.mockResolvedValue({ id: 8, horarios: [] });
  const r = await consultar().expect(400);
  expect(r.body.errores.fecha).toContain('Horario no válido');
});
it.each(['07:30', '19:30'])(
  '400 informa hora fuera de atención: %s',
  async (h) => {
    const r = await consultar({ hora: h }).expect(400);
    expect(r.body.errores.hora).toContain('Horario no válido');
    expect(repo.findMesasDisponibles).not.toHaveBeenCalled();
  },
);
it('permite las 2 horas exactas hasta el cierre', async () => {
  await consultar({ hora: '19:00' }).expect(200);
});
