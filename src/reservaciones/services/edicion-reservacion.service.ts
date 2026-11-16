import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuloOrigen } from '@PrismaClient';
import { NotificacionesService } from '@Notificaciones/services';
import {
  EdicionReservacionRepository,
  ReservacionRepository,
  MesaNoDisponibleError,
  type ReservaEditable,
} from '@Reservaciones/repositories';
import type { ModificarReservacionDto } from '@Reservaciones/dto';
import type { ConsultarDisponibilidadDto } from '@Reservaciones/dto';
import {
  diaDeReserva,
  validarHorarioReservacion,
} from '../utils/horario-reservacion.js';

import {
  resumenReservacion,
  horarioRespuesta,
  mesaDisponibleRespuesta,
} from '../utils/reservacion-respuesta.js';

@Injectable()
export class EdicionReservacionService {
  constructor(
    private readonly repository: EdicionReservacionRepository,
    private readonly avisos: NotificacionesService,
    private readonly disponibilidad: ReservacionRepository,
  ) {}

  private id(valor: string) {
    const id = Number(valor.slice(2));
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new NotFoundException('Reservación no encontrada.');
    return id;
  }

  private existente(
    reserva: ReservaEditable | null,
  ): asserts reserva is ReservaEditable {
    if (!reserva) throw new NotFoundException('Reservación no encontrada.');
  }

  private editable(reserva: ReservaEditable) {
    if (reserva.estado !== 'CONFIRMADA')
      throw new BadRequestException(
        'Solo podés modificar una reservación confirmada.',
      );
    if (reserva.inicio.getTime() <= Date.now())
      throw new BadRequestException(
        'Solo podés modificar una reservación próxima que todavía no haya comenzado.',
      );
  }

  private respuesta(reserva: ReservaEditable) {
    return {
      ...resumenReservacion(reserva),
      capacidad: reserva.mesa.capacidad,
      version: (reserva.modificadaEn ?? reserva.creadaEn).toISOString(),
      modificadaEn: reserva.modificadaEn?.toISOString() ?? null,
      horarios: reserva.mesa.sucursal.horarios.map(horarioRespuesta),
    };
  }

  async detalle(id: string, clienteId: string) {
    const reserva = await this.repository.buscar(this.id(id), clienteId);
    this.existente(reserva);
    return this.respuesta(reserva);
  }

  async alternativas(
    id: string,
    clienteId: string,
    datos: ConsultarDisponibilidadDto,
  ) {
    const reserva = await this.repository.buscar(this.id(id), clienteId);
    this.existente(reserva);
    this.editable(reserva);
    const { inicio, fin } = validarHorarioReservacion(
      datos.fecha,
      datos.hora,
      reserva.mesa.sucursal.horarios.find(
        (h) => h.diaSemana === diaDeReserva(datos.fecha),
      ),
    );
    const mesas = await this.disponibilidad.findMesasDisponibles({
      sucursalId: reserva.mesa.sucursalId,
      personas: datos.personas,
      inicio,
      fin,
      excluirReservacionId: reserva.id,
    });
    return mesas.map(mesaDisponibleRespuesta);
  }

  async modificar(
    id: string,
    clienteId: string,
    datos: ModificarReservacionDto,
  ) {
    try {
      return await this.repository.editar(
        this.id(id),
        clienteId,
        async (reserva, tx) => {
          this.existente(reserva);
          this.editable(reserva);
          const version = reserva.modificadaEn ?? reserva.creadaEn;
          if (version.toISOString() !== datos.version)
            throw new ConflictException({
              message:
                'La reservación cambió desde que la abriste. Recargá sus datos antes de editar.',
              codigo: 'RESERVA_MODIFICADA',
            });
          const mesa = await this.repository.mesa(datos.mesaId, tx);
          if (!mesa?.activa || mesa.sucursalId !== reserva.mesa.sucursalId)
            throw new BadRequestException({
              message: 'Seleccioná una mesa activa de la misma sucursal.',
              errores: {
                mesaId: 'Seleccioná una mesa activa de la misma sucursal.',
              },
            });
          if (datos.personas > mesa.capacidad)
            throw new BadRequestException({
              message:
                'La cantidad de personas supera la capacidad de la mesa.',
              errores: {
                personas: `Esta mesa admite hasta ${mesa.capacidad} personas.`,
              },
            });
          const { inicio, fin } = validarHorarioReservacion(
            datos.fecha,
            datos.hora,
            reserva.mesa.sucursal.horarios.find(
              (h) => h.diaSemana === diaDeReserva(datos.fecha),
            ),
          );
          if (
            reserva.mesaId === datos.mesaId &&
            reserva.personas === datos.personas &&
            reserva.inicio.getTime() === inicio.getTime() &&
            reserva.fin.getTime() === fin.getTime()
          ) {
            return this.respuesta(reserva);
          }
          const actualizada = await this.repository.guardar(
            reserva.id,
            {
              mesaId: mesa.id,
              personas: datos.personas,
              inicio,
              fin,
              modificadaEn: new Date(
                Math.max(Date.now(), version.getTime() + 1),
              ),
            },
            tx,
          );
          const respuesta = this.respuesta(actualizada);
          // El aviso y la modificación se confirman juntos; un fallo conserva los datos originales.
          await this.avisos.notificar(
            {
              destinatario: { usuarioId: clienteId },
              titulo: 'Reservación modificada',
              mensaje: `${respuesta.reservacionId}: mesa ${respuesta.mesa}, ${respuesta.sucursal}, ${respuesta.fecha} a las ${respuesta.hora}, ${respuesta.personas} personas.`,
              moduloOrigen: ModuloOrigen.RESERVACIONES,
              referencia: {
                tipo: 'reservacion-modificada',
                id: `${reserva.id}:${respuesta.version}`,
              },
            },
            tx,
          );
          return respuesta;
        },
      );
    } catch (error) {
      if (error instanceof MesaNoDisponibleError) {
        throw new ConflictException({
          message:
            'La mesa ya no está disponible. Tus datos originales se conservaron; elegí otra mesa.',
          codigo: 'MESA_NO_DISPONIBLE',
        });
      }
      throw error;
    }
  }
}
