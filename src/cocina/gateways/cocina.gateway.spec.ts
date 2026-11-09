import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AuthService } from '@Auth/services';
import type { PedidoCocinaDto } from '@Cocina/dto';
import { CocinaEvento } from '@Cocina/events';
import { CocinaGateway } from '@Cocina/gateways';
import { Rol, type User } from '@PrismaClient';

const USUARIOS: Record<string, Partial<User>> = {
  'token-cocina-a': { id: 'a', rol: Rol.COCINA, sucursalId: 1 },
  'token-cocina-b': { id: 'b', rol: Rol.COCINA, sucursalId: 2 },
  'token-cliente': { id: 'c', rol: Rol.CLIENTE, sucursalId: null },
  'token-sin-sucursal': { id: 'd', rol: Rol.GERENTE_GENERAL, sucursalId: null },
};

describe('CocinaGateway', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        CocinaGateway,
        {
          provide: AuthService,
          useValue: {
            authenticateAccessToken: (token: string) => {
              const user = USUARIOS[token];
              if (!user) {
                return Promise.reject(
                  new UnauthorizedException('Token de acceso inválido o expirado.'),
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
    url = `http://localhost:${port}/cocina`;
    eventEmitter = app.get(EventEmitter2);
  });

  afterEach(() => {
    while (sockets.length > 0) sockets.pop()?.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  function conectar(token?: string): Socket {
    const socket = io(url, {
      auth: token === undefined ? {} : { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  function resultadoConexion(socket: Socket): Promise<string> {
    return new Promise((resolve) => {
      socket.once('connect', () => resolve('conectado'));
      socket.once('connect_error', (error) => resolve(error.message));
    });
  }

  it('rechaza una conexión con un token inválido', async () => {
    const resultado = await resultadoConexion(conectar('token-falso'));
    expect(resultado).toBe('Token de acceso inválido o expirado.');
  });

  it('rechaza una conexión sin token', async () => {
    const resultado = await resultadoConexion(conectar());
    expect(resultado).toBe('Falta el token de acceso.');
  });

  it('rechaza un rol sin acceso a cocina', async () => {
    const resultado = await resultadoConexion(conectar('token-cliente'));
    expect(resultado).toBe('No tenés permiso para acceder a cocina.');
  });

  it('rechaza un usuario sin sucursal', async () => {
    const resultado = await resultadoConexion(conectar('token-sin-sucursal'));
    expect(resultado).toBe('El usuario no tiene una sucursal asignada.');
  });

  it('un evento de la sucursal A llega a sus sockets y no a los de la sucursal B', async () => {
    const socketA = conectar('token-cocina-a');
    const socketB = conectar('token-cocina-b');
    await Promise.all([resultadoConexion(socketA), resultadoConexion(socketB)]);

    const recibidosA: PedidoCocinaDto[] = [];
    const recibidosB: PedidoCocinaDto[] = [];
    socketA.on('pedido:nuevo', (pedido: PedidoCocinaDto) => recibidosA.push(pedido));
    socketB.on('pedido:nuevo', (pedido: PedidoCocinaDto) => recibidosB.push(pedido));

    const pedido = { id: 41 } as PedidoCocinaDto;
    const llegoA = new Promise((resolve) => socketA.once('pedido:nuevo', resolve));
    eventEmitter.emit(CocinaEvento.PEDIDO_NUEVO, { sucursalId: 1, pedido });
    await llegoA;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(recibidosA).toEqual([pedido]);
    expect(recibidosB).toEqual([]);
  });

  it('reenvía pedido:retirado con solo el id', async () => {
    const socket = conectar('token-cocina-b');
    await resultadoConexion(socket);

    const recibido = new Promise((resolve) => socket.once('pedido:retirado', resolve));
    eventEmitter.emit(CocinaEvento.PEDIDO_RETIRADO, { sucursalId: 2, pedidoId: 7 });

    await expect(recibido).resolves.toEqual({ id: 7 });
  });
});
