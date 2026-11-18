import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EdicionReservacionRepository } from '@Reservaciones/repositories';
import { AvisosReservacionService } from './avisos-reservacion.service.js';
import { resumenReservacion } from '../utils/reservacion-respuesta.js';

@Injectable()
export class CancelacionReservacionService {
  constructor(
    private readonly repository: EdicionReservacionRepository,
    private readonly avisos: AvisosReservacionService,
  ) {}

  async cancelar(codigo: string, clienteId: string) {
    const id = Number(codigo.slice(2));
    if (
      !/^R-\d{1,10}$/.test(codigo) ||
      !Number.isInteger(id) ||
      id < 1 ||
      id > 2147483647
    )
      throw new NotFoundException('Reservación no encontrada.');
    let correos: string[] = [];
    const resultado = await this.repository.editar(
      id,
      clienteId,
      async (reserva, tx) => {
        if (!reserva) throw new NotFoundException('Reservación no encontrada.');
        if (reserva.estado !== 'CONFIRMADA')
          throw new BadRequestException('La reservación ya está cancelada.');
        if (reserva.inicio.getTime() <= Date.now())
          throw new BadRequestException(
            'Solo podés cancelar reservaciones futuras.',
          );
        const version = reserva.modificadaEn ?? reserva.creadaEn;
        const cancelada = await this.repository.cancelar(
          id,
          new Date(Math.max(Date.now(), version.getTime() + 1)),
          tx,
        );
        // El estado y el aviso se confirman juntos, con el mismo bloqueo que H11.
        correos = await this.avisos.registrarCancelada(cancelada, tx);
        return resumenReservacion(cancelada);
      },
    );
    this.avisos.enviarCorreos(correos);
    return resultado;
  }
}
