import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type {
  ReporteResenasQueryDto,
  ReporteResenasResponseDto,
} from '../dto/index.js';
import { ResenaRepository } from '../repositories/index.js';
import { redondearPromedio } from '../utils/index.js';

export const SIN_PERMISO_REPORTE = 'No tienes permiso para ver esta sección';
export const RANGO_INVALIDO =
  'La fecha final no puede ser anterior a la inicial.';
const UN_DIA_MS = 24 * 60 * 60_000;

// Inicio del día en El Salvador (UTC-6)
const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00-06:00`);

@Injectable()
export class ReporteResenasService {
  constructor(private readonly repository: ResenaRepository) {}

  async reporte(
    sucursalId: number | null,
    { desde, hasta }: ReporteResenasQueryDto,
  ): Promise<ReporteResenasResponseDto> {
    // Un gerente solo ve su propia sucursal
    if (sucursalId === null) throw new ForbiddenException(SIN_PERMISO_REPORTE);
    if (desde && hasta && hasta < desde) {
      throw new BadRequestException({
        statusCode: 400,
        message: RANGO_INVALIDO,
        errores: { hasta: RANGO_INVALIDO },
      });
    }

    const [sucursal, grupos] = await Promise.all([
      this.repository.nombreSucursal(sucursalId),
      this.repository.distribucionSucursal(
        sucursalId,
        desde ? inicioDia(desde) : undefined,
        // Incluye todo el día final
        hasta ? new Date(inicioDia(hasta).getTime() + UN_DIA_MS) : undefined,
      ),
    ]);
    if (sucursal === null) throw new ForbiddenException(SIN_PERMISO_REPORTE);

    const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let suma = 0;
    for (const g of grupos) {
      const n = g.estrellas as keyof typeof distribucion;
      distribucion[n] = g._count._all;
      total += g._count._all;
      suma += g.estrellas * g._count._all;
    }

    return {
      sucursal: sucursal.nombre,
      promedio: total === 0 ? null : redondearPromedio(suma / total),
      total,
      distribucion,
      desde: desde ?? null,
      hasta: hasta ?? null,
    };
  }
}
