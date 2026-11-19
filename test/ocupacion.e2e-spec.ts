import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OcupacionController } from '../dist/ocupacion/controllers/ocupacion.controller.js';
import { OcupacionService } from '../dist/ocupacion/services/ocupacion.service.js';
import { OcupacionRepository } from '../dist/ocupacion/repositories/ocupacion.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../dist/auth/guards/roles.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';
import { Rol } from '@PrismaClient';

const usuario = (rol: Rol, sucursalId: number | null = 1) => ({
  id: 'u-1',
  email: 'gerente@restaurante.com',
  nombre: 'Gerente Centro',
  isActive: true,
  rol,
  sucursalId,
});

const repo = {
  sucursal: vi.fn(),
  reservaciones: vi.fn(),
};

const verificarToken = vi.fn();
const buscarUsuario = vi.fn();

let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [OcupacionController],
    providers: [
      OcupacionService,
      { provide: OcupacionRepository, useValue: repo },
      {
        provide: AuthService,
        useValue: {
          authenticateAccessToken: async (token: string) => {
            await verificarToken(token);
            return buscarUsuario();
          },
        },
      },
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
  verificarToken.mockResolvedValue({ sub: 'u-1', email: 'gerente@restaurante.com' });
  buscarUsuario.mockResolvedValue(usuario(Rol.GERENTE, 1));
  repo.sucursal.mockResolvedValue({
    id: 1,
    nombre: 'Centro',
    _count: { mesas: 8 },
    horarios: [
      {
        apertura: new Date('1970-01-01T08:00:00Z'),
        cierre: new Date('1970-01-01T10:00:00Z'),
      },
    ],
  });
  repo.reservaciones.mockResolvedValue([]);
});

describe('GET /api/v1/sucursales/:id/ocupacion', () => {
  it('responde 401 si no se envía token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/sucursales/1/ocupacion?fecha=2026-11-20')
      .expect(401);
  });

  it('responde 403 si el rol no es GERENTE', async () => {
    buscarUsuario.mockResolvedValue(usuario(Rol.CLIENTE, 1));
    await request(app.getHttpServer())
      .get('/api/v1/sucursales/1/ocupacion?fecha=2026-11-20')
      .set('Authorization', 'Bearer token-cliente')
      .expect(403);
  });

  it('responde 403 si el gerente consulta una sucursal distinta a la suya', async () => {
    buscarUsuario.mockResolvedValue(usuario(Rol.GERENTE, 2));
    await request(app.getHttpServer())
      .get('/api/v1/sucursales/1/ocupacion?fecha=2026-11-20')
      .set('Authorization', 'Bearer token-gerente-2')
      .expect(403);
  });

  it('responde 400 si falta la fecha o tiene formato inválido', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/sucursales/1/ocupacion')
      .set('Authorization', 'Bearer token-gerente')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/sucursales/1/ocupacion?fecha=20-11-2026')
      .set('Authorization', 'Bearer token-gerente')
      .expect(400);
  });

  it('responde 200 con el cálculo de ocupación proyectada de la sucursal', async () => {
    repo.reservaciones.mockResolvedValue([
      {
        mesaId: 2,
        inicio: new Date('2026-11-20T08:00:00-06:00'),
        fin: new Date('2026-11-20T10:00:00-06:00'),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/sucursales/1/ocupacion?fecha=2026-11-20')
      .set('Authorization', 'Bearer token-gerente')
      .expect(200);

    expect(res.body).toEqual({
      fecha: '2026-11-20',
      sucursalId: 1,
      sucursal: 'Centro',
      mesasActivas: 8,
      calculable: true,
      bloques: [
        {
          horaInicio: '08:00',
          horaFin: '09:00',
          mesasReservadas: 1,
          mesasDisponibles: 7,
          porcentajeOcupacion: 12.5,
        },
        {
          horaInicio: '09:00',
          horaFin: '10:00',
          mesasReservadas: 1,
          mesasDisponibles: 7,
          porcentajeOcupacion: 12.5,
        },
      ],
    });
  });
});
