import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservacionRepository } from '@Reservaciones/repositories';
import type {
  ConsultarDisponibilidadDto,
  MesaDisponibleResponseDto,
  SucursalResponseDto,
} from '@Reservaciones/dto';

const DURACION_MINUTOS = 120;
// America/El_Salvador usa UTC-06:00.
const DESFASE_EL_SALVADOR = '-06:00';

@Injectable()
export class ReservacionesService {
  constructor(private readonly reservacionRepository: ReservacionRepository) {}

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
    const inicio = new Date(`${fecha}T${hora}:00${DESFASE_EL_SALVADOR}`);
    const fin = new Date(inicio.getTime() + DURACION_MINUTOS * 60_000);
    const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    const sucursal = await this.reservacionRepository.findSucursalConHorario(
      sucursalId,
      diaSemana,
    );

    if (!sucursal) {
      throw new NotFoundException('La sucursal solicitada no existe.');
    }
    if (inicio.getTime() < Date.now()) {
      throw new BadRequestException(
        'fecha y hora no pueden estar en el pasado.',
      );
    }

    const horario = sucursal.horarios[0];
    if (!horario) {
      throw new BadRequestException(
        'La sucursal no tiene horario de atención para la fecha solicitada.',
      );
    }

    const [horas, minutos] = hora.split(':').map(Number);
    const inicioMinutos = horas * 60 + minutos;
    const apertura =
      horario.apertura.getUTCHours() * 60 + horario.apertura.getUTCMinutes();
    const cierre =
      horario.cierre.getUTCHours() * 60 + horario.cierre.getUTCMinutes();
    if (inicioMinutos < apertura || inicioMinutos + DURACION_MINUTOS > cierre) {
      throw new BadRequestException(
        'hora debe permitir las 2 horas completas dentro del horario de atención.',
      );
    }

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
