import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import { AuthService } from '@Auth/services';
import { Rol } from '@PrismaClient';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { LealtadService } from '../services/index.js';
import { LealtadController } from './lealtad.controller.js';

describe('Regla de acumulación (HTTP)', () => {
  const ruta = '/api/v1/lealtad/admin/regla';
  const lealtad = {
    consultarRegla: vi.fn(),
    configurarRegla: vi.fn(),
    deshabilitarRegla: vi.fn(),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [LealtadController],
      providers: [
        { provide: LealtadService, useValue: lealtad },
        {
          provide: AuthService,
          useValue: {
            authenticateAccessToken: (token: string) =>
              Promise.resolve({ id: token, rol: token }),
          },
        },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    const reflector = modulo.get(Reflector);
    app.useGlobalGuards(
      new JwtAuthGuard(reflector, modulo.get(AuthService)),
      new RolesGuard(reflector),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => vi.resetAllMocks());
  afterAll(async () => app?.close());

  it('devuelve el literal JSON null cuando no hay regla vigente', async () => {
    lealtad.consultarRegla.mockResolvedValue(null);
    const respuesta = await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', `Bearer ${Rol.GERENTE}`)
      .expect(200)
      .expect('Content-Type', /^application\/json\b/);

    expect(respuesta.text).toBe('null');
    expect(respuesta.body).toBeNull();
  });

  it('devuelve el objeto JSON de la regla vigente', async () => {
    const fecha = new Date('2026-11-20T18:00:00Z');
    const regla = {
      id: 1,
      puntosPorDolar: 3,
      activa: true,
      vigenteDesde: fecha,
      modificadaEn: null,
      deshabilitadaEn: null,
      creadaEn: fecha,
    };
    lealtad.consultarRegla.mockResolvedValue(regla);

    await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', `Bearer ${Rol.GERENTE}`)
      .expect('Content-Type', /^application\/json\b/)
      .expect(200, {
        ...regla,
        vigenteDesde: fecha.toISOString(),
        creadaEn: fecha.toISOString(),
      });
  });

  it('mantiene el 401 sin sesión y el 500 si falla la consulta', async () => {
    await request(app.getHttpServer()).get(ruta).expect(401);
    expect(lealtad.consultarRegla).not.toHaveBeenCalled();

    lealtad.consultarRegla.mockRejectedValue(new Error('Consulta fallida'));
    await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', `Bearer ${Rol.GERENTE}`)
      .expect(500, { statusCode: 500, message: 'Internal server error' });
  });

  it.each([Rol.CLIENTE, Rol.GERENTE_GENERAL])(
    'impide consultar, configurar o deshabilitar con el rol %s',
    async (rol) => {
      const http = request(app.getHttpServer());
      await http.get(ruta).set('Authorization', `Bearer ${rol}`).expect(403);
      await http
        .put(ruta)
        .set('Authorization', `Bearer ${rol}`)
        .send({ puntosPorDolar: 3 })
        .expect(403);
      await http.delete(ruta).set('Authorization', `Bearer ${rol}`).expect(403);

      expect(lealtad.consultarRegla).not.toHaveBeenCalled();
      expect(lealtad.configurarRegla).not.toHaveBeenCalled();
      expect(lealtad.deshabilitarRegla).not.toHaveBeenCalled();
    },
  );
});
