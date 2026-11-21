import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  EstadoItem,
  EstadoPago,
  EstadoPedido,
  Prisma,
  TipoPedido,
} from '@PrismaClient';
import { ESTADOS_EN_COCINA } from '@Cocina/constants';
import { cerrarPedidoLlevarListo } from '../../pedidos/utils/cerrar-pedido-llevar.js';
import {
  ItemDeOtraSucursalError,
  ItemNoEncontradoError,
  ItemNoPendienteError,
  PedidoFueraDeCocinaError,
} from '@Cocina/errors';

const PEDIDO_COCINA_INCLUDE = {
  mesa: { select: { numero: true } },
  detalles: {
    orderBy: { id: 'asc' },
    include: { platillo: { select: { nombre: true } } },
  },
  pagos: { select: { estado: true } },
} satisfies Prisma.PedidoInclude;

export type PedidoCocina = Prisma.PedidoGetPayload<{
  include: typeof PEDIDO_COCINA_INCLUDE;
}>;

export interface ItemMarcadoListo {
  itemId: number;
  pedidoId: number;
  listoEn: Date;
  pedidoEstado: EstadoPedido;
  pedidoCompletado: boolean;
}

interface FilaItemBloqueado {
  pedidoId: number;
  sucursalId: number;
  estadoItem: EstadoItem;
  estadoPedido: EstadoPedido;
  tipo: TipoPedido;
}

@Injectable()
export class PedidoCocinaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPendientesBySucursal(sucursalId: number): Promise<PedidoCocina[]> {
    return this.prisma.pedido.findMany({
      where: {
        sucursalId,
        estado: { in: [...ESTADOS_EN_COCINA] },
        detalles: { some: { estado: EstadoItem.PENDIENTE } },
        OR: [
          { tipo: TipoPedido.MESA },
          { pagos: { some: { estado: EstadoPago.CONFIRMADO } } },
        ],
      },
      include: PEDIDO_COCINA_INCLUDE,
      orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
    });
  }

  marcarItemListo(
    itemId: number,
    sucursalId: number,
  ): Promise<ItemMarcadoListo> {
    return this.prisma.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<FilaItemBloqueado[]>(Prisma.sql`
        SELECT d.pedido_id AS "pedidoId", p.sucursal_id AS "sucursalId",
          d.estado AS "estadoItem", p.estado AS "estadoPedido", p.tipo
        FROM detalle_pedido d
        JOIN pedido p ON p.id = d.pedido_id
        WHERE d.id = ${itemId}
        FOR UPDATE OF d, p
      `);

      if (!fila) throw new ItemNoEncontradoError(itemId);
      if (fila.sucursalId !== sucursalId)
        throw new ItemDeOtraSucursalError(itemId);
      if (fila.estadoItem !== EstadoItem.PENDIENTE)
        throw new ItemNoPendienteError(itemId);
      if (!ESTADOS_EN_COCINA.includes(fila.estadoPedido)) {
        throw new PedidoFueraDeCocinaError(fila.pedidoId);
      }

      const { listoEn } = await tx.detallePedido.update({
        where: { id: itemId },
        data: { estado: EstadoItem.LISTO, listoEn: new Date() },
        select: { listoEn: true },
      });

      const pendientes = await tx.detallePedido.count({
        where: { pedidoId: fila.pedidoId, estado: EstadoItem.PENDIENTE },
      });
      const pedidoCompletado = pendientes === 0;
      let pedidoEstado = fila.estadoPedido;
      if (pedidoCompletado) {
        await tx.pedido.update({
          where: { id: fila.pedidoId },
          data: { estado: EstadoPedido.LISTO },
        });
        pedidoEstado = EstadoPedido.LISTO;
        if (
          fila.tipo === TipoPedido.LLEVAR &&
          (await cerrarPedidoLlevarListo(tx, fila.pedidoId))
        ) {
          pedidoEstado = EstadoPedido.CERRADO;
        }
      }

      return {
        itemId,
        pedidoId: fila.pedidoId,
        listoEn: listoEn as Date,
        pedidoEstado,
        pedidoCompletado,
      };
    });
  }

  findById(id: number): Promise<PedidoCocina | null> {
    return this.prisma.pedido.findUnique({
      where: { id },
      include: PEDIDO_COCINA_INCLUDE,
    });
  }
}
