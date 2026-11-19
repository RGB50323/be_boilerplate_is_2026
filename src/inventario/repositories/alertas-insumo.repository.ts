import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoAlerta, Prisma, type UnidadInsumo } from '@PrismaClient';
import {
  AlertaDeOtraSucursalError,
  AlertaNoEncontradaError,
  AlertaResueltaError,
} from '@Inventario/errors';

export interface InsumoTrasMovimiento {
  insumoId: number;
  sucursalId: number;
  nombre: string;
  unidad: UnidadInsumo;
  sucursal: string;
  cantidad: Prisma.Decimal;
  minimo: Prisma.Decimal;
}

export interface AlertaCreada extends InsumoTrasMovimiento {
  alertaId: number;
}

const SELECCION_ALERTA = {
  id: true,
  insumoId: true,
  cantidad: true,
  minimo: true,
  estado: true,
  creadaEn: true,
  insumo: { select: { nombre: true, unidad: true } },
} satisfies Prisma.AlertaInsumoSelect;

export type AlertaRegistro = Prisma.AlertaInsumoGetPayload<{
  select: typeof SELECCION_ALERTA;
}>;

interface FilaAlertaBloqueada {
  sucursalId: number;
  estado: EstadoAlerta;
}

@Injectable()
export class AlertasInsumoRepository {
  constructor(private readonly prisma: PrismaService) {}

  findNoResuelta(insumoId: number, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).alertaInsumo.findFirst({
      where: { insumoId, estado: { not: EstadoAlerta.RESUELTA } },
      select: { id: true },
    });
  }

  async crear(
    insumo: InsumoTrasMovimiento,
    tx?: Prisma.TransactionClient,
  ): Promise<number | null> {
    const filas = await (tx ?? this.prisma).$queryRaw<{ id: number }[]>(Prisma.sql`
      INSERT INTO alerta_insumo (insumo_id, sucursal_id, cantidad, minimo)
      VALUES (
        ${insumo.insumoId},
        ${insumo.sucursalId},
        ${insumo.cantidad.toString()}::numeric,
        ${insumo.minimo.toString()}::numeric
      )
      ON CONFLICT (insumo_id) WHERE estado <> 'RESUELTA' DO NOTHING
      RETURNING id
    `);
    return filas[0]?.id ?? null;
  }

  async resolver(alertaId: number, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).alertaInsumo.update({
      where: { id: alertaId },
      data: { estado: EstadoAlerta.RESUELTA, resueltaEn: new Date() },
    });
  }

  findNoResueltasBySucursal(sucursalId: number) {
    return this.prisma.alertaInsumo.findMany({
      where: {
        sucursalId,
        estado: { in: [EstadoAlerta.ACTIVA, EstadoAlerta.VISTA] },
      },
      orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
      select: SELECCION_ALERTA,
    });
  }

  marcarVista(alertaId: number, sucursalId: number): Promise<AlertaRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<FilaAlertaBloqueada[]>(Prisma.sql`
        SELECT sucursal_id AS "sucursalId", estado
        FROM alerta_insumo
        WHERE id = ${alertaId}
        FOR UPDATE
      `);

      if (!fila) throw new AlertaNoEncontradaError(alertaId);
      if (fila.sucursalId !== sucursalId) throw new AlertaDeOtraSucursalError(alertaId);
      if (fila.estado === EstadoAlerta.RESUELTA) throw new AlertaResueltaError(alertaId);

      if (fila.estado === EstadoAlerta.ACTIVA) {
        return tx.alertaInsumo.update({
          where: { id: alertaId },
          data: { estado: EstadoAlerta.VISTA, vistaEn: new Date() },
          select: SELECCION_ALERTA,
        });
      }
      return tx.alertaInsumo.findUniqueOrThrow({
        where: { id: alertaId },
        select: SELECCION_ALERTA,
      });
    });
  }
}
