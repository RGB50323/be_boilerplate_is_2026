import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '@Auth/services';
import {
  COCINA_NAMESPACE,
  ROLES_COCINA,
  salaSucursal,
} from '@Cocina/constants';
import {
  CocinaEvento,
  type CocinaServerToClientEvents,
  type PedidoCocinaEvento,
  type PedidoRetiradoEvento,
} from '@Cocina/events';
import { origenesPermitidos } from '../../config/cors.js';

interface CocinaSocketData {
  userId: string;
  sucursalId: number;
}

type SinEventos = Record<never, never>;

type CocinaNamespace = Namespace<
  SinEventos,
  CocinaServerToClientEvents,
  SinEventos,
  CocinaSocketData
>;
type CocinaSocket = Socket<
  SinEventos,
  CocinaServerToClientEvents,
  SinEventos,
  CocinaSocketData
>;

@WebSocketGateway({
  namespace: COCINA_NAMESPACE,
  cors: {
    origin: origenesPermitidos(),
    credentials: true,
  },
})
export class CocinaGateway
  implements OnGatewayInit<CocinaNamespace>, OnGatewayConnection<CocinaSocket>
{
  private readonly logger = new Logger(CocinaGateway.name);

  @WebSocketServer()
  private readonly server: CocinaNamespace;

  constructor(private readonly authService: AuthService) {}

  afterInit(namespace: CocinaNamespace): void {
    namespace.use((socket, next) => {
      void this.autenticar(socket).then(
        () => next(),
        (error: unknown) =>
          next(
            error instanceof Error ? error : new Error('Conexión rechazada.'),
          ),
      );
    });
  }

  handleConnection(socket: CocinaSocket): void {
    void socket.join(salaSucursal(socket.data.sucursalId));
  }

  @OnEvent(CocinaEvento.PEDIDO_NUEVO)
  emitirPedidoNuevo({ sucursalId, pedido }: PedidoCocinaEvento): void {
    this.server.to(salaSucursal(sucursalId)).emit('pedido:nuevo', pedido);
  }

  @OnEvent(CocinaEvento.PEDIDO_ACTUALIZADO)
  emitirPedidoActualizado({ sucursalId, pedido }: PedidoCocinaEvento): void {
    this.server.to(salaSucursal(sucursalId)).emit('pedido:actualizado', pedido);
  }

  @OnEvent(CocinaEvento.PEDIDO_RETIRADO)
  emitirPedidoRetirado({ sucursalId, pedidoId }: PedidoRetiradoEvento): void {
    this.server
      .to(salaSucursal(sucursalId))
      .emit('pedido:retirado', { id: pedidoId });
  }

  @OnEvent(CocinaEvento.ITEM_LISTO)
  emitirItemListo({ sucursalId, pedido }: PedidoCocinaEvento): void {
    this.server.to(salaSucursal(sucursalId)).emit('item:listo', pedido);
  }

  @OnEvent(CocinaEvento.PEDIDO_LISTO)
  emitirPedidoListo({ sucursalId, pedido }: PedidoCocinaEvento): void {
    this.server.to(salaSucursal(sucursalId)).emit('pedido:listo', pedido);
  }

  @OnEvent(CocinaEvento.PEDIDO_ENTREGADO)
  emitirPedidoEntregado({ sucursalId, pedido }: PedidoCocinaEvento): void {
    this.server.to(salaSucursal(sucursalId)).emit('pedido:entregado', pedido);
  }

  private async autenticar(socket: CocinaSocket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token === '') {
      throw new Error('Falta el token de acceso.');
    }

    const user = await this.authService.authenticateAccessToken(token);

    if (!ROLES_COCINA.includes(user.rol)) {
      this.logger.warn(
        `Conexión rechazada: el rol ${user.rol} no tiene acceso a cocina.`,
      );
      throw new Error('No tenés permiso para acceder a cocina.');
    }
    if (user.sucursalId === null) {
      throw new Error('El usuario no tiene una sucursal asignada.');
    }

    socket.data.userId = user.id;
    socket.data.sucursalId = user.sucursalId;
  }
}
