import { ApiProperty } from '@nestjs/swagger';
import { ModuloOrigen } from '@PrismaClient';
import type {
  NotificacionLeida,
  NotificacionListado,
} from '@Notificaciones/types';

export class ReferenciaNotificacionResponseDto {
  @ApiProperty({ example: 'pedido' })
  tipo!: string;

  @ApiProperty({ example: '7b358b94-2735-4dd9-95b8-66c7e064a03e' })
  id!: string;
}

export class NotificacionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Pedido listo' })
  titulo!: string;

  @ApiProperty({ example: 'Tu pedido ya está listo para retirar.' })
  mensaje!: string;

  @ApiProperty({ enum: ModuloOrigen })
  moduloOrigen!: ModuloOrigen;

  @ApiProperty({ type: ReferenciaNotificacionResponseDto, nullable: true })
  referencia!: ReferenciaNotificacionResponseDto | null;

  @ApiProperty()
  leida!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  creadaEn!: Date;

  static fromEntity(
    notificacion: NotificacionListado,
  ): NotificacionResponseDto {
    return {
      id: notificacion.id,
      titulo: notificacion.titulo,
      mensaje: notificacion.mensaje,
      moduloOrigen: notificacion.moduloOrigen,
      referencia:
        notificacion.referenciaTipo !== null &&
        notificacion.referenciaId !== null
          ? {
              tipo: notificacion.referenciaTipo,
              id: notificacion.referenciaId,
            }
          : null,
      leida: notificacion.leida,
      creadaEn: notificacion.creadaEn,
    };
  }
}

export class ListaNotificacionesResponseDto {
  @ApiProperty({ type: [NotificacionResponseDto] })
  datos!: NotificacionResponseDto[];

  @ApiProperty({ description: 'Cantidad total de notificaciones del usuario.' })
  total!: number;

  @ApiProperty()
  pagina!: number;

  @ApiProperty({ description: 'Cantidad total de notificaciones no leídas.' })
  noLeidas!: number;
}

export class NotificacionLeidaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: true })
  leida!: true;

  @ApiProperty({ type: String, format: 'date-time' })
  leidaEn!: Date;

  static fromEntity(
    notificacion: NotificacionLeida,
  ): NotificacionLeidaResponseDto {
    return {
      id: notificacion.id,
      leida: true,
      leidaEn: notificacion.leidaEn as Date,
    };
  }
}
