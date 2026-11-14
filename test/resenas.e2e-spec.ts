import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
// Se prueba el artefacto compilado para conservar metadata de los decoradores de Nest.
import { ResenasController } from '../dist/resenas/controllers/resenas.controller.js';
import { ResenasService } from '../dist/resenas/services/resenas.service.js';
import { ResenaRepository } from '../dist/resenas/repositories/resena.repository.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt-auth.guard.js';
import { AuthService } from '../dist/auth/services/auth.service.js';
import { ApiValidationPipe } from '../dist/common/pipes/api-validation.pipe.js';

const repo = {
  platilloActivo: vi.fn(),
  resumen: vi.fn(),
  findPagina: vi.fn(),
};
let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ResenasController],
    providers: [
      ResenasService,
      { provide: ResenaRepository, useValue: repo },
      { provide: AuthService, useValue: {} },
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
  repo.platilloActivo.mockResolvedValue(true);
  repo.resumen.mockResolvedValue({
    _avg: { estrellas: 4.5 },
    _count: { _all: 12 },
  });
  repo.findPagina.mockResolvedValue([
    {
      id: 3,
      estrellas: 4,
      comentario: null,
      creadaEn: new Date('2026-11-01T18:00:00Z'),
      cliente: { nombre: 'Ana', apellido: 'López' },
    },
  ]);
});

describe('GET /api/v1/platillos/:id/resenas', () => {
  it('es pública y por defecto devuelve la página 1', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platillos/7/resenas')
      .expect(200);

    expect(res.body).toEqual({
      promedio: 4.5,
      total: 12,
      pagina: 1,
      totalPaginas: 2,
      resenas: [
        {
          id: 3,
          estrellas: 4,
          comentario: null,
          fecha: '2026-11-01',
          cliente: 'Ana L.',
        },
      ],
    });
    expect(repo.findPagina).toHaveBeenCalledWith(7, 0, 10);
  });

  it('usa la página indicada', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/platillos/7/resenas?pagina=2')
      .expect(200);
    expect(repo.findPagina).toHaveBeenCalledWith(7, 10, 10);
  });

  it.each(['0', '-1', 'abc'])('responde 400 con pagina=%s', async (pagina) => {
    await request(app.getHttpServer())
      .get(`/api/v1/platillos/7/resenas?pagina=${pagina}`)
      .expect(400);
    expect(repo.findPagina).not.toHaveBeenCalled();
  });

  it('responde 404 si el platillo no existe o está deshabilitado', async () => {
    repo.platilloActivo.mockResolvedValue(false);
    await request(app.getHttpServer())
      .get('/api/v1/platillos/99/resenas')
      .expect(404);
  });
});
