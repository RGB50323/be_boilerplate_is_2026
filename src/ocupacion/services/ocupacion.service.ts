import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import { OcupacionRepository } from '../repositories/ocupacion.repository.js';

const HORA_MS = 60 * 60 * 1000;
const fechaLocal = (fecha: string, hora = '00:00') =>
  new Date(`${fecha}T${hora}:00-06:00`);
const horaLocal = (fecha: Date) =>
  new Date(fecha.getTime() - 6 * HORA_MS).toISOString().slice(11, 16);

@Injectable()
export class OcupacionService {
  constructor(private readonly repository: OcupacionRepository) {}

  async consultar(sucursalId: number, fecha: string, usuario: User) {
    if (usuario.sucursalId === null || usuario.sucursalId !== sucursalId)
      throw new ForbiddenException(
        'No tenés permiso para consultar esa sucursal.',
      );
    const inicioDia = fechaLocal(fecha);
    if (
      Number.isNaN(inicioDia.getTime()) ||
      inicioDia.toISOString().slice(0, 10) !== fecha
    )
      throw new BadRequestException('La fecha no es válida.');
    const diaSemana = new Date(`${fecha}T12:00:00-06:00`).getUTCDay();
    const sucursal = await this.repository.sucursal(sucursalId, diaSemana);
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada.');
    const totalMesas = sucursal._count.mesas;
    const horario = sucursal.horarios[0];
    if (!horario) {
      return {
        fecha,
        sucursalId,
        sucursal: sucursal.nombre,
        mesasActivas: totalMesas,
        calculable: totalMesas > 0,
        bloques: [],
      };
    }
    const hora = (valor: Date) => valor.toISOString().slice(11, 16);
    const apertura = fechaLocal(fecha, hora(horario.apertura));
    const cierre = fechaLocal(fecha, hora(horario.cierre));
    const reservas = await this.repository.reservaciones(
      sucursalId,
      apertura,
      cierre,
    );
    const bloques = [];
    for (
      let bloque = apertura;
      bloque < cierre;
      bloque = new Date(bloque.getTime() + HORA_MS)
    ) {
      const fin = new Date(
        Math.min(bloque.getTime() + HORA_MS, cierre.getTime()),
      );
      const reservadas = new Set(
        reservas
          .filter((r) => r.inicio < fin && r.fin > bloque)
          .map((r) => r.mesaId),
      ).size;
      bloques.push({
        horaInicio: horaLocal(bloque),
        horaFin: horaLocal(fin),
        mesasReservadas: reservadas,
        mesasDisponibles: Math.max(0, totalMesas - reservadas),
        porcentajeOcupacion: totalMesas
          ? Math.round((reservadas / totalMesas) * 10_000) / 100
          : null,
      });
    }
    return {
      fecha,
      sucursalId,
      sucursal: sucursal.nombre,
      mesasActivas: totalMesas,
      calculable: totalMesas > 0,
      bloques,
    };
  }
}
