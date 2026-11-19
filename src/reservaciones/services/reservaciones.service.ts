import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReservacionRepository } from '@Reservaciones/repositories';
import { OcupacionEvento } from '../../ocupacion/events/ocupacion.events.js';
import type {
  ConsultarDisponibilidadDto,
  CrearReservacionDto,
  ReservacionResponseDto,
  MesaDisponibleResponseDto,
  SucursalResponseDto,
} from '@Reservaciones/dto';

import {
  diaDeReserva,
  validarHorarioReservacion,
} from '../utils/horario-reservacion.js';
import { paginar } from '@Common/paginacion';
import { AvisosReservacionService } from './avisos-reservacion.service.js';

import {
  resumenReservacion,
  horarioRespuesta,
  mesaDisponibleRespuesta,
} from '../utils/reservacion-respuesta.js';

@Injectable()
export class ReservacionesService {
  constructor(
    private readonly reservacionRepository: ReservacionRepository,
    private readonly avisos: AvisosReservacionService,
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  async crear(
    clienteId: string,
    datos: CrearReservacionDto,
  ): Promise<ReservacionResponseDto> {
    const mesa = await this.reservacionRepository.findMesaConHorario(
      datos.mesaId,
      diaDeReserva(datos.fecha),
    );
    if (!mesa?.activa)
      throw new NotFoundException(
        'La mesa no existe o está inactiva. Elegí otra mesa.',
      );
    if (datos.personas > mesa.capacidad) {
      const message = `Esta mesa admite hasta ${mesa.capacidad} personas.`;
      throw new BadRequestException({
        statusCode: 400,
        message,
        errores: { personas: message },
      });
    }
    const { inicio, fin } = validarHorarioReservacion(
      datos.fecha,
      datos.hora,
      mesa.sucursal.horarios[0],
    );
    const reservacion = await this.reservacionRepository.crearConfirmada({
      mesaId: mesa.id,
      clienteId,
      nombre: datos.nombre,
      telefono: datos.telefono,
      correo: datos.correo,
      personas: datos.personas,
      inicio,
      fin,
    });
    if (!reservacion)
      throw new ConflictException(
        'La mesa ya no está disponible en ese horario. Elegí otra mesa.',
      );
    await this.avisos.creada(reservacion.id);
    this.eventEmitter?.emit(OcupacionEvento.RESERVACION_CAMBIADA, {
      sucursalId: mesa.sucursalId,
      fecha: datos.fecha,
    });
    return this.respuesta(reservacion);
  }

  async listarMias(clienteId: string, pagina: number) {
    const [reservaciones, total] =
      await this.reservacionRepository.listarPorCliente(clienteId, pagina, 10);
    return paginar(
      reservaciones.map((r) => this.respuesta(r)),
      total,
      pagina,
      10,
    );
  }

  private respuesta(
    reservacion: NonNullable<
      Awaited<ReturnType<ReservacionRepository['crearConfirmada']>>
    >,
  ): ReservacionResponseDto {
    return resumenReservacion(reservacion);
  }

  async listarSucursales(): Promise<SucursalResponseDto[]> {
    const sucursales =
      await this.reservacionRepository.findSucursalesConHorarios();
    return sucursales.map(({ id, nombre, horarios }) => ({
      id,
      nombre,
      horarios: horarios.map(horarioRespuesta),
    }));
  }

  async consultarDisponibilidad(
    sucursalId: number,
    { fecha, hora, personas }: ConsultarDisponibilidadDto,
  ): Promise<MesaDisponibleResponseDto[]> {
    const diaSemana = diaDeReserva(fecha);
    const sucursal = await this.reservacionRepository.findSucursalConHorario(
      sucursalId,
      diaSemana,
    );

    if (!sucursal) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'La sucursal solicitada no existe.',
        errores: { sucursalId: 'La sucursal solicitada no existe.' },
      });
    }
    const { inicio, fin } = validarHorarioReservacion(
      fecha,
      hora,
      sucursal.horarios[0],
    );

    const mesas = await this.reservacionRepository.findMesasDisponibles({
      sucursalId,
      personas,
      inicio,
      fin,
    });
    return mesas.map(mesaDisponibleRespuesta);
  }
}
