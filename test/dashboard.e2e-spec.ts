import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from '../dist/dashboard/controllers/dashboard.controller.js';
import { DashboardService } from '../dist/dashboard/services/dashboard.service.js';
import { DashboardRepository } from '../dist/dashboard/repositories/dashboard.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../dist/auth/guards/roles.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';

const hora = (value: string) => new Date(`1970-01-01T${value}:00Z`);
const usuario = (rol: string, sucursalId: number | null = null) => ({
  id: 'u-1',
  isActive: true,
  rol,
  sucursalId,
});

const repo = {
  sucursalExiste: vi.fn(),
  ventasPorSucursal: vi.fn(),
  platillosVendidos: vi.fn(),
  ventasPorHora: vi.fn(),
  horarios: vi.fn(),
  ventasConfirmadasDetalle: vi.fn(),
  contarVentasConfirmadas: vi.fn(),
};
const verificarToken = vi.fn();
const buscarUsuario = vi.fn();
const ventaFila = {
  pedidoId: 15,
  numero: 'CEN-0015',
  sucursalId: 1,
  sucursal: 'Centro',
  fecha: '2026-11-08T18:05:00.000Z',
  tipo: 'MESA',
  articulos: 3,
  subtotal: 25,
  descuentos: 2.5,
  venta: 22.5,
};
let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [DashboardController],
    providers: [
      DashboardService,
      { provide: DashboardRepository, useValue: repo },
      {
        // JwtAuthGuard valida el token con AuthService y carga el usuario.
        provide: AuthService,
        useValue: {
          authenticateAccessToken: async (token: string) => {
            await verificarToken(token);
            return buscarUsuario();
          },
        },
      },
      // Mismo orden que app.module.ts: primero el token, luego el rol.
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
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
  repo.ventasConfirmadasDetalle.mockResolvedValue([ventaFila]);
  repo.contarVentasConfirmadas.mockResolvedValue(45);
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
    sucursales: [
      { sucursalId: 1, nombre: 'Centro', ventas: 8120, pedidos: 640, ticketPromedio: 12.69 },
    ],
    totalGeneral: { ventas: 8120, pedidos: 640, ticketPromedio: 12.69 },
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

it.each(['CLIENTE', 'MESERO', 'COCINA'])(
  '%s recibe 403 y no se consulta la base',
  async (rol) => {
    buscarUsuario.mockResolvedValue(usuario(rol));
    await consultar().expect(403);
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  },
);

describe('gerente de sucursal', () => {
  it('recibe solo las ventas de su sucursal', async () => {
    buscarUsuario.mockResolvedValue(usuario('GERENTE', 1));
    await consultar().expect(200);
    for (const consulta of [repo.ventasPorSucursal, repo.platillosVendidos]) {
      expect(consulta).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 1 }));
    }
    expect(repo.horarios).toHaveBeenCalledWith(1, undefined);
  });

  it('puede pedir su propia sucursal', async () => {
    buscarUsuario.mockResolvedValue(usuario('GERENTE', 1));
    await consultar({ sucursalId: '1' }).expect(200);
  });

  it('403 si pide otra sucursal y no se consulta la base', async () => {
    buscarUsuario.mockResolvedValue(usuario('GERENTE', 1));
    await consultar({ sucursalId: '2' }).expect(403);
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  });

  it('403 si no tiene sucursal asignada', async () => {
    buscarUsuario.mockResolvedValue(usuario('GERENTE'));
    await consultar().expect(403);
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  });
});

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

describe('GET /dashboard/ventas/detalle', () => {
  const detalle = (query: Record<string, unknown> = {}, token = 'token') => {
    const r = request(app.getHttpServer())
      .get('/api/v1/dashboard/ventas/detalle')
      .query({ desde: '2026-11-01', hasta: '2026-11-08', ...query });
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  it('devuelve la página pedida con el total', async () => {
    const r = await detalle({ pagina: '2', porPagina: '20', sucursalId: '1' }).expect(200);
    expect(r.body).toEqual({ items: [ventaFila], total: 45, pagina: 2, porPagina: 20 });
    expect(repo.ventasConfirmadasDetalle).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: 1 }),
      { limite: 20, desplazamiento: 20 },
    );
  });

  it('usa página 1 y 20 por página si no se indican', async () => {
    const r = await detalle().expect(200);
    expect(r.body).toMatchObject({ pagina: 1, porPagina: 20 });
  });

  it.each([
    ['pagina', 0],
    ['porPagina', 101],
    ['porPagina', 'muchas'],
    ['diaSemana', 1],
  ])('400 identifica %s=%s', async (campo, valor) => {
    const r = await detalle({ [campo]: valor }).expect(400);
    expect(r.body.errores[campo]).toBeTruthy();
  });

  it('403 para un rol distinto de gerente', async () => {
    buscarUsuario.mockResolvedValue(usuario('MESERO'));
    await detalle().expect(403);
    expect(repo.ventasConfirmadasDetalle).not.toHaveBeenCalled();
  });

  it('el gerente solo ve las ventas de su sucursal', async () => {
    buscarUsuario.mockResolvedValue(usuario('GERENTE', 3));
    await detalle().expect(200);
    expect(repo.ventasConfirmadasDetalle).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: 3 }),
      { limite: 20, desplazamiento: 0 },
    );
    await detalle({ sucursalId: '1' }).expect(403);
  });

  it('401 sin token', async () => {
    await detalle({}, '').expect(401);
  });
});

describe('GET /dashboard/ventas/exportar', () => {
  const exportar = (query: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .get('/api/v1/dashboard/ventas/exportar')
      .query({ desde: '2026-11-01', hasta: '2026-11-08', ...query })
      .set('Authorization', 'Bearer token');

  it('descarga un CSV con una fila por sucursal y el total general', async () => {
    const r = await exportar().expect(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toBe(
      'attachment; filename="ventas-por-sucursal_2026-11-01_2026-11-08.csv"',
    );
    expect(r.text.split('\r\n')).toEqual([
      'Sucursal,Ventas,Pedidos,Ticket promedio',
      'Centro,8120.00,640,12.69',
      'Total general,8120.00,640,12.69',
    ]);
    expect(repo.ventasConfirmadasDetalle).not.toHaveBeenCalled();
  });

  it('respeta la sucursal elegida', async () => {
    await exportar({ sucursalId: '1' }).expect(200);
    expect(repo.ventasPorSucursal).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: 1 }),
    );
  });

  it('400 si el rango está invertido', async () => {
    await exportar({ desde: '2026-11-08', hasta: '2026-11-01' }).expect(400);
  });

  it('403 para un rol distinto de gerente', async () => {
    buscarUsuario.mockResolvedValue(usuario('COCINA'));
    await exportar().expect(403);
  });

  it('el gerente exporta solo su sucursal', async () => {
    buscarUsuario.mockResolvedValue(usuario('GERENTE', 1));
    await exportar().expect(200);
    expect(repo.ventasPorSucursal).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: 1 }),
    );
    await exportar({ sucursalId: '2' }).expect(403);
  });
});
