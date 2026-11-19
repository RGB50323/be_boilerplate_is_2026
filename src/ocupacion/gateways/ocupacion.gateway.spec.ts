import {
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AuthService } from '@Auth/services';
import { Rol, type User } from '@PrismaClient';
import { OcupacionEvento } from '../events/ocupacion.events.js';
import { OcupacionGateway } from './ocupacion.gateway.js';

const USUARIOS: Record<string, Partial<User>> = {
  'token-gerente-a': { id: 'a', rol: Rol.GERENTE, sucursalId: 1 },
  'token-gerente-b': { id: 'b', rol: Rol.GERENTE, sucursalId: 2 },
  'token-cliente': { id: 'c', rol: Rol.CLIENTE, sucursalId: null },
  'token-sin-sucursal': {
    id: 'd',
    rol: Rol.GERENTE,
    sucursalId: null,
  },
};

describe('OcupacionGateway', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        OcupacionGateway,
        {
          provide: AuthService,
          useValue: {
            authenticateAccessToken: (token: string) => {
              const user = USUARIOS[token];
              if (!user) {
                return Promise.reject(
                  new UnauthorizedException(
                    'Token de acceso inválido o expirado.',
                  ),
                );
              }
              return Promise.resolve(user);
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}/ocupacion`;
    eventEmitter = app.get(EventEmitter2);
  });

  afterEach(() => {
    while (sockets.length > 0) sockets.pop()?.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  function conectar(token?: string): Socket {
    const s = io(url, {
      auth: token !== undefined ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(s);
    return s;
  }

  function resultadoConexion(socket: Socket): Promise<string> {
    return new Promise((resolve) => {
      socket.on('connect', () => resolve('conectado'));
      socket.on('connect_error', (error) => resolve(error.message));
      socket.connect();
    });
  }

  it('rechaza una conexión sin token', async () => {
    const resultado = await resultadoConexion(conectar());
    expect(resultado).toBe('Falta el token de acceso.');
  });

  it('rechaza un rol distinto de gerente', async () => {
    const resultado = await resultadoConexion(conectar('token-cliente'));
    expect(resultado).toBe('No tenés permiso para acceder a ocupación.');
  });

  it('rechaza un gerente sin sucursal asignada', async () => {
    const resultado = await resultadoConexion(conectar('token-sin-sucursal'));
    expect(resultado).toBe('El usuario no tiene una sucursal asignada.');
  });

  it('permite conectar a un gerente con sucursal', async () => {
    const resultado = await resultadoConexion(conectar('token-gerente-a'));
    expect(resultado).toBe('conectado');
  });

  it('emite ocupacion:actualizada solo a la sucursal correspondiente', async () => {
    const socketA = conectar('token-gerente-a');
    const socketB = conectar('token-gerente-b');

    await Promise.all([
      resultadoConexion(socketA),
      resultadoConexion(socketB),
    ]);

    const eventoRecibidoA = new Promise<{ sucursalId: number; fecha: string }>(
      (resolve) => {
        socketA.on('ocupacion:actualizada', resolve);
      },
    );

    let eventoEnB = false;
    socketB.on('ocupacion:actualizada', () => {
      eventoEnB = true;
    });

    eventEmitter.emit(OcupacionEvento.RESERVACION_CAMBIADA, {
      sucursalId: 1,
      fecha: '2026-11-20',
    });

    const datos = await eventoRecibidoA;
    expect(datos).toEqual({ sucursalId: 1, fecha: '2026-11-20' });
    expect(eventoEnB).toBe(false);
  });
});
