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
import { COCINA_NAMESPACE, ROLES_COCINA, salaSucursal } from '@Cocina/constants';
import {
  CocinaEvento,
  type CocinaServerToClientEvents,
  type PedidoCocinaEvento,
  type PedidoRetiradoEvento,
} from '@Cocina/events';

/** Lo que se guarda en cada socket después de autenticarlo. */
interface CocinaSocketData {
  userId: string;
  sucursalId: number;
}

/** El tablero solo escucha: no hay eventos de cliente a servidor. */
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

/**
 * Tablero de cocina en tiempo real (Socket.IO, namespace `/cocina`).
 *
 * El cliente se conecta con `io('/cocina', { auth: { token } })`, usando el
 * mismo access token que en HTTP. La conexión se rechaza en el handshake (el
 * cliente recibe `connect_error`) si el token no es válido, si el rol no
 * tiene acceso a cocina o si el usuario no tiene sucursal.
 *
 * Cada socket se une a la room de su sucursal y solo recibe los eventos de
 * esa room. La sucursal sale del usuario releído de la base, nunca de lo que
 * mande el cliente.
 *
 * El token se valida al conectar. Si expira con el socket abierto, la
 * conexión sigue viva; la próxima reconexión exige un token vigente.
 */
@WebSocketGateway({ namespace: COCINA_NAMESPACE })
export class CocinaGateway
  implements OnGatewayInit<CocinaNamespace>, OnGatewayConnection<CocinaSocket>
{
  private readonly logger = new Logger(CocinaGateway.name);

  @WebSocketServer()
  private readonly server: CocinaNamespace;

  constructor(private readonly authService: AuthService) {}

  afterInit(namespace: CocinaNamespace): void {
    // Middleware del namespace: corre antes de aceptar la conexión, así un
    // socket no autorizado nunca llega a unirse a una room.
    namespace.use((socket, next) => {
      void this.autenticar(socket).then(
        () => next(),
        (error: unknown) =>
          next(error instanceof Error ? error : new Error('Conexión rechazada.')),
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
    this.server.to(salaSucursal(sucursalId)).emit('pedido:retirado', { id: pedidoId });
  }

  /** @throws {Error} con el motivo, que el cliente recibe en `connect_error`. */
  private async autenticar(socket: CocinaSocket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token === '') {
      throw new Error('Falta el token de acceso.');
    }

    const user = await this.authService.authenticateAccessToken(token);

    if (!ROLES_COCINA.includes(user.rol)) {
      this.logger.warn(`Conexión rechazada: el rol ${user.rol} no tiene acceso a cocina.`);
      throw new Error('No tenés permiso para acceder a cocina.');
    }
    if (user.sucursalId === null) {
      throw new Error('El usuario no tiene una sucursal asignada.');
    }

    socket.data.userId = user.id;
    socket.data.sucursalId = user.sucursalId;
  }
}
