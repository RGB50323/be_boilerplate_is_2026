import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
// Se prueba el artefacto compilado para conservar metadata de los decoradores de Nest.
import { DashboardController } from '../dist/dashboard/controllers/dashboard.controller.js';
import { DashboardService } from '../dist/dashboard/services/dashboard.service.js';
import { DashboardRepository } from '../dist/dashboard/repositories/dashboard.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { UsersService } from '../dist/users/services/users.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';

const hora = (value: string) => new Date(`1970-01-01T${value}:00Z`);
const usuario = (rol: string) => ({ id: 'u-1', isActive: true, rol });

const repo = {
  sucursalExiste: vi.fn(),
  ventasPorSucursal: vi.fn(),
  platillosVendidos: vi.fn(),
  ventasPorHora: vi.fn(),
  horarios: vi.fn(),
};
const verificarToken = vi.fn();
const buscarUsuario = vi.fn();
let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [DashboardController],
    providers: [
      DashboardService,
      { provide: DashboardRepository, useValue: repo },
      { provide: JwtService, useValue: { verifyAsync: verificarToken } },
      { provide: UsersService, useValue: { findById: buscarUsuario } },
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
  verificarToken.mockResolvedValue({ sub: 'u-1', email: 'g@example.com' });
  buscarUsuario.mockResolvedValue(usuario('GERENTE_GENERAL'));
  repo.sucursalExiste.mockResolvedValue(true);
  repo.ventasPorSucursal.mockResolvedValue([
    { sucursalId: 1, nombre: 'Centro', ventas: 8120, pedidos: 640 },
  ]);
  repo.platillosVendidos.mockResolvedValue([
    { platilloId: 4, nombre: 'Hamburguesa', cantidad: 10, monto: 89.9 },
  ]);
  repo.ventasPorHora.mockResolvedValue([
    { sucursalId: 1, hora: 12, ventas: 500 },
  ]);
  repo.horarios.mockResolvedValue([
    { sucursalId: 1, apertura: hora('12:00'), cierre: hora('14:00') },
  ]);
});

function consultar(query: Record<string, unknown> = {}, token = 'token') {
  const r = request(app.getHttpServer())
    .get('/api/v1/dashboard/ventas')
    .query({ desde: '2026-11-01', hasta: '2026-11-08', ...query });
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
}

it('el gerente general recibe ventas, platillos y horarios pico', async () => {
  const r = await consultar().expect(200);
  expect(r.body).toEqual({
    desde: '2026-11-01',
    hasta: '2026-11-08',
    sucursales: [{ sucursalId: 1, nombre: 'Centro', ventas: 8120, pedidos: 640 }],
    platillos: [{ platilloId: 4, nombre: 'Hamburguesa', cantidad: 10, monto: 89.9 }],
    horariosPico: [
      {
        sucursalId: 1,
        nombre: 'Centro',
        franjas: [
          { hora: 12, ventas: 500 },
          { hora: 13, ventas: 0 },
        ],
      },
    ],
  });
  expect(r.headers['cache-control']).toBe('no-store');
});

it('pasa la sucursal y el día de la semana como números', async () => {
  await consultar({ sucursalId: '2', diaSemana: '5' }).expect(200);
  expect(repo.ventasPorHora).toHaveBeenCalledWith(
    expect.objectContaining({ sucursalId: 2 }),
    5,
  );
});

it('sin token responde 401', async () => {
  await consultar({}, '').expect(401);
  expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
});

it.each(['CLIENTE', 'MESERO', 'COCINA', 'GERENTE'])(
  '%s recibe 403 y no se consulta la base',
  async (rol) => {
    buscarUsuario.mockResolvedValue(usuario(rol));
    await consultar().expect(403);
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  },
);

it('400 si la fecha final es anterior a la inicial', async () => {
  const r = await consultar({ desde: '2026-11-08', hasta: '2026-11-01' }).expect(400);
  expect(r.body.errores.hasta).toContain('Rango no válido');
});

it.each([
  ['desde', '2026-02-30'],
  ['desde', ''],
  ['hasta', '08/11/2026'],
  ['sucursalId', 0],
  ['sucursalId', 'abc'],
  ['diaSemana', 7],
  ['diaSemana', -1],
])('400 identifica %s=%s', async (campo, valor) => {
  const r = await consultar({ [campo]: valor }).expect(400);
  expect(r.body.errores[campo]).toBeTruthy();
  expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
});

it('rechaza parámetros extra', async () => {
  const r = await consultar({ total: 'todo' }).expect(400);
  expect(r.body.errores.total).toBeTruthy();
});

it('404 si la sucursal no existe', async () => {
  repo.sucursalExiste.mockResolvedValue(false);
  const r = await consultar({ sucursalId: 99 }).expect(404);
  expect(r.body.errores.sucursalId).toBeTruthy();
});
