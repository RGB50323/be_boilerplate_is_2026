import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservacionRepository } from '../repositories/reservacion.repository.js';
import { AvisosReservacionService } from './avisos-reservacion.service.js';

const ANTICIPACION_MS = 2 * 60 * 60_000;

@Injectable()
export class RecordatoriosReservacionService {
  private readonly logger = new Logger(RecordatoriosReservacionService.name);

  constructor(
    private readonly repository: ReservacionRepository,
    private readonly avisos: AvisosReservacionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async ejecutar(): Promise<void> {
    try {
      await this.enviarPendientes(new Date());
    } catch (error) {
      this.logger.error('Falló el proceso de recordatorios', error);
    }
  }

  // Devuelve cuántos recordatorios se enviaron en esta pasada
  async enviarPendientes(ahora: Date): Promise<number> {
    const pendientes = await this.repository.buscarRecordatoriosPendientes(
      ahora,
      new Date(ahora.getTime() + ANTICIPACION_MS),
    );

    let enviados = 0;
    for (const reservacion of pendientes) {
      // Hecha o cambiada con menos de 2 h de anticipación: solo confirmación
      const guardadaEn = reservacion.modificadaEn ?? reservacion.creadaEn;
      if (
        reservacion.inicio.getTime() - guardadaEn.getTime() <
        ANTICIPACION_MS
      ) {
        continue;
      }
      if (
        !(await this.repository.marcarRecordatorioEnviado(
          reservacion.id,
          ahora,
        ))
      ) {
        continue;
      }
      await this.avisos.recordatorio(reservacion.id);
      enviados += 1;
    }
    return enviados;
  }
}
