import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';

export interface FiltroVentas {
  inicio: Date;
  fin: Date;
  sucursalId?: number;
}

export interface FilaVentasSucursal {
  sucursalId: number;
  nombre: string;
  ventas: number;
  pedidos: number;
}

export interface FilaPlatillo {
  platilloId: number;
  nombre: string;
  cantidad: number;
  monto: number;
}

export interface FilaVentasHora {
  sucursalId: number;
  hora: number;
  ventas: number;
}

// America/El_Salvador usa UTC-06:00 todo el año (sin horario de verano).
const DESFASE_HORAS = 6;

/** `timestamp` sin zona, en UTC, que es como Prisma guarda los DateTime. */
const utc = (fecha: Date) => fecha.toISOString().replace('T', ' ').slice(0, 23);

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sucursalExiste(id: number): Promise<boolean> {
    return (await this.prisma.sucursal.count({ where: { id } })) > 0;
  }

  ventasPorSucursal(filtro: FiltroVentas): Promise<FilaVentasSucursal[]> {
    return this.prisma.$queryRaw<FilaVentasSucursal[]>`
      WITH ventas AS (${this.ventasConfirmadas(filtro)})
      SELECT
        s.id                                                AS "sucursalId",
        s.nombre                                            AS "nombre",
        COALESCE(ROUND(SUM(ventas.monto_neto), 2), 0)::float8 AS "ventas",
        COUNT(ventas.pedido_id)::int                        AS "pedidos"
      FROM sucursal s
      LEFT JOIN ventas ON ventas.sucursal_id = s.id
      ${filtro.sucursalId === undefined ? Prisma.empty : Prisma.sql`WHERE s.id = ${filtro.sucursalId}`}
      GROUP BY s.id, s.nombre
      ORDER BY s.id`;
  }


  platillosVendidos(filtro: FiltroVentas): Promise<FilaPlatillo[]> {
    return this.prisma.$queryRaw<FilaPlatillo[]>`
      WITH ventas AS (${this.ventasConfirmadas(filtro)})
      SELECT
        pl.id                                                AS "platilloId",
        pl.nombre                                            AS "nombre",
        SUM(d.cantidad)::int                                 AS "cantidad",
        ROUND(SUM(d.cantidad * d.precio_unitario), 2)::float8 AS "monto"
      FROM ventas
      JOIN detalle_pedido d ON d.pedido_id = ventas.pedido_id
      JOIN platillo pl ON pl.id = d.platillo_id
      GROUP BY pl.id, pl.nombre
      ORDER BY "cantidad" DESC, "monto" DESC, pl.nombre ASC`;
  }

  ventasPorHora(
    filtro: FiltroVentas,
    diaSemana?: number,
  ): Promise<FilaVentasHora[]> {
    return this.prisma.$queryRaw<FilaVentasHora[]>`
      WITH ventas AS (${this.ventasConfirmadas(filtro)})
      SELECT
        ventas.sucursal_id                          AS "sucursalId",
        EXTRACT(HOUR FROM ventas.fecha_local)::int  AS "hora",
        ROUND(SUM(ventas.monto_neto), 2)::float8    AS "ventas"
      FROM ventas
      ${diaSemana === undefined ? Prisma.empty : Prisma.sql`WHERE EXTRACT(DOW FROM ventas.fecha_local) = ${diaSemana}`}
      GROUP BY 1, 2
      ORDER BY 1, 2`;
  }

  horarios(sucursalId?: number, diaSemana?: number) {
    return this.prisma.horarioSucursal.findMany({
      where: { sucursalId, diaSemana },
      select: { sucursalId: true, apertura: true, cierre: true },
    });
  }

  private ventasConfirmadas({ inicio, fin, sucursalId }: FiltroVentas) {
    return Prisma.sql`
      SELECT
        v.pedido_id,
        v.sucursal_id,
        v.monto_neto,
        v.fecha_pago - make_interval(hours => ${DESFASE_HORAS}) AS fecha_local
      FROM venta_confirmada v
      WHERE v.fecha_pago >= ${utc(inicio)}::timestamp
        AND v.fecha_pago <  ${utc(fin)}::timestamp
        ${sucursalId === undefined ? Prisma.empty : Prisma.sql`AND v.sucursal_id = ${sucursalId}`}
        AND NOT EXISTS (
          SELECT 1 FROM pago r
          WHERE r.pedido_id = v.pedido_id AND r.estado = 'REEMBOLSADO'
        )`;
  }
}
