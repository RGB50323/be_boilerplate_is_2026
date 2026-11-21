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
import { Rol } from '@PrismaClient';
import { origenesPermitidos } from '../../config/cors.js';
import {
  OCUPACION_NAMESPACE,
  salaSucursal,
} from '../constants/ocupacion.constants.js';
import {
  OcupacionEvento,
  type OcupacionServerToClientEvents,
  type ReservacionCambiadaEvento,
} from '../events/ocupacion.events.js';

interface OcupacionSocketData {
  userId: string;
  sucursalId: number;
}

type SinEventos = Record<never, never>;

type OcupacionNamespace = Namespace<
  SinEventos,
  OcupacionServerToClientEvents,
  SinEventos,
  OcupacionSocketData
>;
type OcupacionSocket = Socket<
  SinEventos,
  OcupacionServerToClientEvents,
  SinEventos,
  OcupacionSocketData
>;

@WebSocketGateway({
  namespace: OCUPACION_NAMESPACE,
  cors: {
    origin: origenesPermitidos(),
    credentials: true,
  },
})
export class OcupacionGateway
  implements
    OnGatewayInit<OcupacionNamespace>,
    OnGatewayConnection<OcupacionSocket>
{
  private readonly logger = new Logger(OcupacionGateway.name);

  @WebSocketServer()
  private readonly server!: OcupacionNamespace;

  constructor(private readonly authService: AuthService) {}

  afterInit(namespace: OcupacionNamespace): void {
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

  handleConnection(socket: OcupacionSocket): void {
    void socket.join(salaSucursal(socket.data.sucursalId));
  }

  @OnEvent(OcupacionEvento.RESERVACION_CAMBIADA)
  emitirReservacionCambiada(payload: ReservacionCambiadaEvento): void {
    this.server
      .to(salaSucursal(payload.sucursalId))
      .emit('ocupacion:actualizada', payload);
  }

  private async autenticar(socket: OcupacionSocket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token === '') {
      throw new Error('Falta el token de acceso.');
    }

    const user = await this.authService.authenticateAccessToken(token);

    if (user.rol !== Rol.GERENTE) {
      this.logger.warn(
        `Conexión rechazada: el rol ${user.rol} no tiene acceso a ocupación.`,
      );
      throw new Error('No tenés permiso para acceder a ocupación.');
    }
    if (user.sucursalId === null) {
      throw new Error('El usuario no tiene una sucursal asignada.');
    }

    socket.data.userId = user.id;
    socket.data.sucursalId = user.sucursalId;
  }
}
