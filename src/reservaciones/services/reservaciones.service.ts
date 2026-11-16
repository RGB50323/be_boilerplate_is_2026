import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReservacionRepository } from '@Reservaciones/repositories';
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

@Injectable()
export class ReservacionesService {
  constructor(private readonly reservacionRepository: ReservacionRepository) {}

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
    // El almacenamiento es UTC; la respuesta utiliza la misma hora local de H09.
    const local = new Date(
      reservacion.inicio.getTime() - 6 * 60 * 60_000,
    ).toISOString();
    return {
      reservacionId: `R-${String(reservacion.id).padStart(6, '0')}`,
      estado: reservacion.estado,
      mesaId: reservacion.mesaId,
      mesa: reservacion.mesa.numero,
      sucursalId: reservacion.mesa.sucursalId,
      sucursal: reservacion.mesa.sucursal.nombre,
      fecha: local.slice(0, 10),
      hora: local.slice(11, 16),
      personas: reservacion.personas,
    };
  }

  async listarSucursales(): Promise<SucursalResponseDto[]> {
    const sucursales =
      await this.reservacionRepository.findSucursalesConHorarios();
    return sucursales.map(({ id, nombre, horarios }) => ({
      id,
      nombre,
      horarios: horarios.map(({ diaSemana, apertura, cierre }) => ({
        diaSemana,
        // Prisma representa TIME con Date. Se conserva la hora local del seed,
        // sin exponer la fecha auxiliar ni aplicar otro desplazamiento horario.
        apertura: apertura.toISOString().slice(11, 16),
        cierre: cierre.toISOString().slice(11, 16),
      })),
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
    return mesas.map(({ id, numero, capacidad, zona }) => ({
      mesaId: id,
      numero,
      capacidad,
      zona,
    }));
  }
}
