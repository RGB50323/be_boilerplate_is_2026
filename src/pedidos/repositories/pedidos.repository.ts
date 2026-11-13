import { Injectable } from '@nestjs/common';
import { EstadoPedido, Prisma, TipoPedido } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

const ESTADOS_CERRADOS: EstadoPedido[] = [
  EstadoPedido.ENTREGADO,
  EstadoPedido.CANCELADO,
];

export class DisponibilidadInsuficienteError extends Error {
  constructor(readonly platilloId: number) {
    super('Disponibilidad insuficiente');
  }
}

export type ItemNuevo = {
  platilloId: number;
  cantidad: number;
  nota: string | null;
  precioUnitario: Prisma.Decimal;
};

export type DatosPedido = {
  sucursalId: number;
  mesaId: number;
  meseroId: string;
  total: Prisma.Decimal;
  items: ItemNuevo[];
};

@Injectable()
export class PedidosRepository {
  constructor(private readonly prisma: PrismaService) { }

  buscarMesa(id: number) {
    return this.prisma.mesa.findUnique({
      where: { id },
      select: { id: true, sucursalId: true, activa: true },
    });
  }

  buscarPlatillos(ids: number[], sucursalId: number) {
    return this.prisma.platillo.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nombre: true,
        activo: true,
        categoria: { select: { activa: true } },
        sucursales: {
          where: { sucursalId },
          select: { precio: true, disponibilidad: true },
        },
      },
    });
  }

  buscarPedidoAbierto(mesaId: number) {
    return this.prisma.pedido.findFirst({
      where: { mesaId, estado: { notIn: ESTADOS_CERRADOS } },
      select: { id: true },
    });
  }

  crear(datos: DatosPedido) {
    const { sucursalId, mesaId, meseroId, total, items } = datos;

    const pedidos = new Map<number, number>();
    for (const item of items) {
      pedidos.set(
        item.platilloId,
        (pedidos.get(item.platilloId) ?? 0) + item.cantidad,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const [platilloId, cantidad] of pedidos) {
        const { count } = await tx.platilloSucursal.updateMany({
          where: { platilloId, sucursalId, disponibilidad: { gte: cantidad } },
          data: { disponibilidad: { decrement: cantidad } },
        });
        if (count === 0) throw new DisponibilidadInsuficienteError(platilloId);
      }

      const creado = await tx.pedido.create({
        data: {
          tipo: TipoPedido.MESA,
          estado: EstadoPedido.ENVIADO_COCINA,
          sucursalId,
          mesaId,
          meseroId,
          subtotal: total,
          total,
          detalles: {
            create: items.map((item) => ({
              platilloId: item.platilloId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              nota: item.nota,
            })),
          },
        },
        select: { id: true },
      });

      const numero = `S${sucursalId}-${String(creado.id).padStart(6, '0')}`;
      return tx.pedido.update({
        where: { id: creado.id },
        data: { numero },
        select: {
          id: true,
          numero: true,
          estado: true,
          total: true,
          creadoEn: true,
        },
      });
    });
  }
}