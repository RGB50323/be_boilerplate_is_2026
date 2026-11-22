import 'reflect-metadata';
import cors from 'cors';
import express from 'express';
import request from 'supertest';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { io } from 'socket.io-client';
import { Rol } from '@PrismaClient';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { origenesPermitidos } from './cors.js';

// H34. Habilitar CORS para el frontend desplegado.
// AC3 se completa con la prueba manual desde el frontend desplegado en Heroku.

const GATEWAY_OPTIONS = 'websockets:gateway_options';

function app() {
  const servidor = express();
  servidor.use(cors({ origin: origenesPermitidos(), credentials: true }));
  servidor.get('/api/v1/health', (_req, res) => res.json({ ok: true }));
  return servidor;
}

describe('H34. Habilitar CORS para el frontend desplegado', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('AC1: la API acepta los orígenes de FRONTEND_URL (uno o varios) y rechaza los demás', async () => {
    vi.stubEnv(
      'FRONTEND_URL',
      'https://los-burle-web.herokuapp.com/, http://localhost:3000',
    );
    expect(origenesPermitidos()).toEqual([
      'https://los-burle-web.herokuapp.com',
      'http://localhost:3000',
    ]);

    const permitido = await request(app())
      .get('/api/v1/health')
      .set('Origin', 'https://los-burle-web.herokuapp.com');
    expect(permitido.headers['access-control-allow-origin']).toBe(
      'https://los-burle-web.herokuapp.com',
    );

    const ajeno = await request(app())
      .get('/api/v1/health')
      .set('Origin', 'https://otro-sitio.com');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('AC2: los gateways de cocina y ocupación usan los mismos orígenes que la API', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://los-burle-web.herokuapp.com');
    vi.resetModules();
    const { CocinaGateway } =
      await import('../cocina/gateways/cocina.gateway.js');
    const { OcupacionGateway } =
      await import('../ocupacion/gateways/ocupacion.gateway.js');

    for (const gateway of [CocinaGateway, OcupacionGateway]) {
      const opciones = Reflect.getMetadata(GATEWAY_OPTIONS, gateway);
      expect(opciones.cors.origin).toEqual([
        'https://los-burle-web.herokuapp.com',
      ]);
    }
  });

  it('AC3: un tablero de cocina desde el origen del frontend desplegado conecta y recibe pedidos en vivo', async () => {
    const origen = 'https://los-burle-web.herokuapp.com';
    vi.stubEnv('FRONTEND_URL', origen);
    vi.resetModules();
    const { CocinaGateway } =
      await import('../cocina/gateways/cocina.gateway.js');
    const { AuthService } = await import('@Auth/services');
    const { CocinaEvento } = await import('@Cocina/events');

    const modulo = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        CocinaGateway,
        {
          provide: AuthService,
          useValue: {
            authenticateAccessToken: async () => ({
              id: 'k',
              rol: Rol.COCINA,
              sucursalId: 1,
            }),
          },
        },
      ],
    }).compile();
    const nest = modulo.createNestApplication();
    await nest.listen(0);
    const { port } = nest.getHttpServer().address() as AddressInfo;

    const socket = io(`http://localhost:${port}/cocina`, {
      auth: { token: 'token-cocina' },
      transports: ['polling'],
      extraHeaders: { Origin: origen },
      forceNew: true,
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      const recibido = new Promise((resolve) =>
        socket.once('pedido:nuevo', resolve),
      );
      nest
        .get(EventEmitter2)
        .emit(CocinaEvento.PEDIDO_NUEVO, { sucursalId: 1, pedido: { id: 41 } });
      await expect(recibido).resolves.toEqual({ id: 41 });
    } finally {
      socket.disconnect();
      await nest.close();
    }
  });
});
