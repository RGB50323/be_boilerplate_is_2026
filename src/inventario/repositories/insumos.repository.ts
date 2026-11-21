import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  TipoMovimientoInsumo,
  type UnidadInsumo,
} from '@PrismaClient';
import {
  CantidadMaximaExcedidaError,
  ExistenciaInsuficienteError,
  InsumoDeOtraSucursalError,
  InsumoDuplicadoError,
  InsumoNoEncontradoError,
} from '@Inventario/errors';
import { CANTIDAD_MAXIMA } from '@Inventario/utils';
import type { AlertaCreada, InsumoTrasMovimiento } from './alertas-insumo.repository.js';

const SELECCION_INSUMO = {
  id: true,
  nombre: true,
  unidad: true,
  cantidad: true,
  minimo: true,
} satisfies Prisma.InsumoSelect;

export type InsumoRegistro = Prisma.InsumoGetPayload<{
  select: typeof SELECCION_INSUMO;
}>;

export type DatosInsumo = {
  nombre: string;
  unidad: UnidadInsumo;
  minimo: number;
};

export type DatosMovimiento = {
  tipo: TipoMovimientoInsumo;
  cantidad: number;
  motivo: string;
};

export type EvaluarAlertasEnTransaccion = (
  tx: Prisma.TransactionClient,
  insumo: InsumoTrasMovimiento,
) => Promise<AlertaCreada | null>;

export interface MovimientoRegistrado {
  movimientoId: number;
  cantidadAnterior: Prisma.Decimal;
  cantidadActual: Prisma.Decimal;
  alertaCreada: AlertaCreada | null;
}

interface FilaInsumoBloqueado {
  sucursalId: number;
  cantidad: string;
  minimo: string;
  nombre: string;
  unidad: UnidadInsumo;
  sucursal: string;
}

@Injectable()
export class InsumosRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySucursal(sucursalId: number, q?: string) {
    return this.prisma.insumo.findMany({
      where: {
        sucursalId,
        nombre: q ? { contains: q, mode: 'insensitive' } : undefined,
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: SELECCION_INSUMO,
    });
  }

  async crear(sucursalId: number, datos: DatosInsumo): Promise<InsumoRegistro> {
    try {
      return await this.prisma.insumo.create({
        data: { sucursalId, ...datos },
        select: SELECCION_INSUMO,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new InsumoDuplicadoError(datos.nombre);
      }
      throw error;
    }
  }

  findSucursalDeInsumo(insumoId: number) {
    return this.prisma.insumo.findUnique({
      where: { id: insumoId },
      select: { sucursalId: true },
    });
  }

  registrarMovimiento(
    insumoId: number,
    sucursalId: number,
    usuarioId: string,
    datos: DatosMovimiento,
    evaluarAlertas: EvaluarAlertasEnTransaccion,
  ): Promise<MovimientoRegistrado> {
    return this.prisma.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<FilaInsumoBloqueado[]>(Prisma.sql`
        SELECT i.sucursal_id AS "sucursalId", i.cantidad::text AS cantidad,
          i.minimo::text AS minimo, i.nombre, i.unidad, s.nombre AS sucursal
        FROM insumo i
        JOIN sucursal s ON s.id = i.sucursal_id
        WHERE i.id = ${insumoId}
        FOR UPDATE OF i
      `);

      if (!fila) throw new InsumoNoEncontradoError(insumoId);
      if (fila.sucursalId !== sucursalId) throw new InsumoDeOtraSucursalError(insumoId);

      const cantidadAnterior = new Prisma.Decimal(fila.cantidad);
      const cantidad = new Prisma.Decimal(datos.cantidad);
      const cantidadActual =
        datos.tipo === TipoMovimientoInsumo.ENTRADA
          ? cantidadAnterior.plus(cantidad)
          : cantidadAnterior.minus(cantidad);

      if (cantidadActual.lt(0)) throw new ExistenciaInsuficienteError(insumoId);
      if (cantidadActual.gt(CANTIDAD_MAXIMA)) {
        throw new CantidadMaximaExcedidaError(insumoId);
      }

      await tx.insumo.update({
        where: { id: insumoId },
        data: { cantidad: cantidadActual },
      });
      const { id } = await tx.movimientoInsumo.create({
        data: {
          insumoId,
          tipo: datos.tipo,
          cantidad,
          cantidadAnterior,
          cantidadActual,
          motivo: datos.motivo,
          usuarioId,
        },
        select: { id: true },
      });

      const alertaCreada = await evaluarAlertas(tx, {
        insumoId,
        sucursalId: fila.sucursalId,
        nombre: fila.nombre,
        unidad: fila.unidad,
        sucursal: fila.sucursal,
        cantidad: cantidadActual,
        minimo: new Prisma.Decimal(fila.minimo),
      });

      return { movimientoId: id, cantidadAnterior, cantidadActual, alertaCreada };
    });
  }

  async findMovimientos(insumoId: number, skip: number, take: number) {
    const where = { insumoId };
    const [total, movimientos] = await this.prisma.$transaction([
      this.prisma.movimientoInsumo.count({ where }),
      this.prisma.movimientoInsumo.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          tipo: true,
          cantidad: true,
          motivo: true,
          creadoEn: true,
          usuario: { select: { nombre: true, apellido: true, email: true } },
        },
      }),
    ]);
    return { total, movimientos };
  }
}
