import { Injectable, Logger } from '@nestjs/common';
import { ModuloOrigen } from '@PrismaClient';
import { NotificacionesService } from '@Notificaciones/services';
import { ReservacionRepository } from '../repositories/reservacion.repository.js';
import {
  codigoReservacion,
  fechaHoraLocal,
} from '../utils/horario-reservacion.js';

type TipoAviso = 'confirmada' | 'modificada' | 'cancelada' | 'recordatorio';

const TITULOS: Record<TipoAviso, string> = {
  confirmada: 'Reservación confirmada',
  modificada: 'Reservación modificada',
  cancelada: 'Reservación cancelada',
  recordatorio: 'Recordatorio de tu reservación',
};

const REFERENCIAS: Record<TipoAviso, string> = {
  confirmada: 'RESERVA_CONFIRMADA',
  modificada: 'RESERVA_MODIFICADA',
  cancelada: 'RESERVA_CANCELADA',
  recordatorio: 'RESERVA_RECORDATORIO',
};

// Avisos de H26; H11 y H12 llaman a modificada() y cancelada()
@Injectable()
export class AvisosReservacionService {
  private readonly logger = new Logger(AvisosReservacionService.name);

  constructor(
    private readonly repository: ReservacionRepository,
    private readonly notificaciones: NotificacionesService,
  ) {}

  creada(reservacionId: number): Promise<boolean> {
    return this.avisar(reservacionId, 'confirmada');
  }

  modificada(reservacionId: number): Promise<boolean> {
    return this.avisar(reservacionId, 'modificada');
  }

  cancelada(reservacionId: number): Promise<boolean> {
    return this.avisar(reservacionId, 'cancelada');
  }

  recordatorio(reservacionId: number): Promise<boolean> {
    return this.avisar(reservacionId, 'recordatorio');
  }

  // No lanza; devuelve false si el aviso no quedó registrado
  private async avisar(
    reservacionId: number,
    tipo: TipoAviso,
  ): Promise<boolean> {
    try {
      const reservacion = await this.repository.buscarParaAviso(reservacionId);
      if (reservacion === null) return true;

      const codigo = codigoReservacion(reservacion.id);
      const { fecha, hora } = fechaHoraLocal(reservacion.inicio);
      const sucursal = reservacion.mesa.sucursal.nombre;
      const detalle = `${fecha} a las ${hora}, ${reservacion.personas} personas, sucursal ${sucursal}, mesa ${reservacion.mesa.numero}.`;
      const mensajes: Record<TipoAviso, string> = {
        confirmada: `Tu reservación ${codigo} quedó confirmada: ${detalle}`,
        modificada: `Tu reservación ${codigo} cambió. Nuevos datos: ${detalle}`,
        cancelada: `Tu reservación ${codigo} fue cancelada: ${detalle}`,
        recordatorio: `Te recordamos tu reservación ${codigo}: ${detalle}`,
      };

      // Cada modificación es un aviso distinto; el resto se envía una sola vez
      const referenciaId =
        tipo === 'modificada'
          ? `${codigo}:${(reservacion.modificadaEn ?? new Date()).getTime()}`
          : codigo;

      await this.notificaciones.notificar({
        destinatario: { usuarioId: reservacion.clienteId },
        titulo: TITULOS[tipo],
        mensaje: mensajes[tipo],
        moduloOrigen: ModuloOrigen.RESERVACIONES,
        referencia: { tipo: REFERENCIAS[tipo], id: referenciaId },
        enviarCorreo: true,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `No se pudo avisar (${tipo}) la reservación ${reservacionId}`,
        error,
      );
      return false;
    }
  }
}
