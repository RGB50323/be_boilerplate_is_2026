import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type TipoPedido } from '@PrismaClient';

export interface FiltroVentas {
  /** Inicio del periodo en UTC, inclusive. */
  inicio: Date;
  /** Fin del periodo en UTC, exclusivo. */
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

export interface FilaVentaConfirmada {
  pedidoId: number;
  numero: string | null;
  sucursalId: number;
  sucursal: string;
  fecha: string;
  tipo: TipoPedido;
  articulos: number;
  subtotal: number;
  descuentos: number;
  venta: number;
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

/**
 * Consultas del dashboard de ventas (H28).
 *
 * Parten de la vista `venta_confirmada` (migración "restricciones", DB-28.1),
 * que ya aplica la regla de negocio: ventas = subtotal − descuentos, sin IVA
 * ni propina, solo pedidos con un pago CONFIRMADO. El periodo y las franjas
 * horarias se toman de la fecha de confirmación del pago.
 *
 * Son SQL a mano porque la vista no está modelada en schema.prisma y porque
 * agrupar por hora local no se puede expresar con el query builder.
 */
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

  /** Ordenados por cantidad y, en empate, por monto (criterios 8 y 9). */
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

  /** Ventas por sucursal y hora local; opcionalmente de un solo día (criterio 12). */
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

  /**
   * Cada venta confirmada del periodo, de la más reciente a la más antigua.
   * Sin `pagina` devuelve todas (para exportar a CSV).
   */
  ventasConfirmadasDetalle(
    filtro: FiltroVentas,
    pagina?: { limite: number; desplazamiento: number },
  ): Promise<FilaVentaConfirmada[]> {
    return this.prisma.$queryRaw<FilaVentaConfirmada[]>`
      WITH ventas AS (${this.ventasConfirmadas(filtro)})
      SELECT
        ventas.pedido_id                                  AS "pedidoId",
        p.numero                                          AS "numero",
        ventas.sucursal_id                                AS "sucursalId",
        s.nombre                                          AS "sucursal",
        to_char(ventas.fecha_pago, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "fecha",
        p.tipo::text                                      AS "tipo",
        COALESCE(d.articulos, 0)::int                     AS "articulos",
        p.subtotal::float8                                AS "subtotal",
        p.descuentos::float8                              AS "descuentos",
        ventas.monto_neto::float8                         AS "venta"
      FROM ventas
      JOIN pedido p ON p.id = ventas.pedido_id
      JOIN sucursal s ON s.id = ventas.sucursal_id
      LEFT JOIN LATERAL (
        SELECT SUM(dp.cantidad) AS articulos
        FROM detalle_pedido dp
        WHERE dp.pedido_id = ventas.pedido_id
      ) d ON TRUE
      ORDER BY ventas.fecha_pago DESC, ventas.pedido_id DESC
      ${pagina ? Prisma.sql`LIMIT ${pagina.limite} OFFSET ${pagina.desplazamiento}` : Prisma.empty}`;
  }

  async contarVentasConfirmadas(filtro: FiltroVentas): Promise<number> {
    const [{ total }] = await this.prisma.$queryRaw<[{ total: number }]>`
      WITH ventas AS (${this.ventasConfirmadas(filtro)})
      SELECT COUNT(*)::int AS "total" FROM ventas`;
    return total;
  }

  /** Horarios de atención, para mostrar también las franjas sin ventas. */
  horarios(sucursalId?: number, diaSemana?: number) {
    return this.prisma.horarioSucursal.findMany({
      where: { sucursalId, diaSemana },
      select: { sucursalId: true, apertura: true, cierre: true },
    });
  }

  /**
   * Pedidos que cuentan como venta en el periodo: los de la vista
   * venta_confirmada, excluyendo además cualquier pedido con un pago
   * reembolsado (criterio 2: "con pago confirmado y sin reembolso").
   */
  private ventasConfirmadas({ inicio, fin, sucursalId }: FiltroVentas) {
    return Prisma.sql`
      SELECT
        v.pedido_id,
        v.sucursal_id,
        v.monto_neto,
        v.fecha_pago,
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
