import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  EstadoItem,
  EstadoPedido,
  Prisma,
  TipoPedido,
} from '@PrismaClient';
import { ItemDeOtraSucursalError, ItemNoEncontradoError } from '@Cocina/errors';
import {
  ItemNoListoError,
  ItemYaEntregadoError,
  PedidoCanceladoError,
} from '@Mesero/errors';

export interface ItemMarcadoEntregado {
  itemId: number;
  pedidoId: number;
  entregadoEn: Date;
  pedidoEstado: EstadoPedido;
  pedidoCompletado: boolean;
}

interface FilaItemBloqueado {
  pedidoId: number;
  sucursalId: number;
  estadoItem: EstadoItem;
  estadoPedido: EstadoPedido;
}

@Injectable()
export class EntregasRepository {
  constructor(private readonly prisma: PrismaService) {}

  findItemsListos(sucursalId: number) {
    return this.prisma.detallePedido.findMany({
      where: {
        estado: EstadoItem.LISTO,
        pedido: {
          sucursalId,
          tipo: TipoPedido.MESA,
          estado: { not: EstadoPedido.CANCELADO },
        },
      },
      orderBy: [{ listoEn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        pedidoId: true,
        cantidad: true,
        listoEn: true,
        platillo: { select: { nombre: true } },
        pedido: { select: { mesa: { select: { numero: true } } } },
      },
    });
  }

  marcarItemEntregado(
    itemId: number,
    sucursalId: number,
    usuarioId: string,
  ): Promise<ItemMarcadoEntregado> {
    return this.prisma.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<FilaItemBloqueado[]>(Prisma.sql`
        SELECT d.pedido_id AS "pedidoId", p.sucursal_id AS "sucursalId",
          d.estado AS "estadoItem", p.estado AS "estadoPedido"
        FROM detalle_pedido d
        JOIN pedido p ON p.id = d.pedido_id
        WHERE d.id = ${itemId}
        FOR UPDATE OF d, p
      `);

      if (!fila) throw new ItemNoEncontradoError(itemId);
      if (fila.sucursalId !== sucursalId) throw new ItemDeOtraSucursalError(itemId);
      if (fila.estadoItem === EstadoItem.ENTREGADO) throw new ItemYaEntregadoError(itemId);
      if (fila.estadoItem !== EstadoItem.LISTO) throw new ItemNoListoError(itemId);
      if (fila.estadoPedido === EstadoPedido.CANCELADO) {
        throw new PedidoCanceladoError(fila.pedidoId);
      }

      const { entregadoEn } = await tx.detallePedido.update({
        where: { id: itemId },
        data: {
          estado: EstadoItem.ENTREGADO,
          entregadoEn: new Date(),
          entregadoPorId: usuarioId,
        },
        select: { entregadoEn: true },
      });

      const porEntregar = await tx.detallePedido.count({
        where: { pedidoId: fila.pedidoId, estado: { not: EstadoItem.ENTREGADO } },
      });
      const pedidoCompletado = porEntregar === 0;
      if (pedidoCompletado) {
        await tx.pedido.update({
          where: { id: fila.pedidoId },
          data: { estado: EstadoPedido.ENTREGADO },
        });
      }

      return {
        itemId,
        pedidoId: fila.pedidoId,
        entregadoEn: entregadoEn as Date,
        pedidoEstado: pedidoCompletado ? EstadoPedido.ENTREGADO : fila.estadoPedido,
        pedidoCompletado,
      };
    });
  }
}
