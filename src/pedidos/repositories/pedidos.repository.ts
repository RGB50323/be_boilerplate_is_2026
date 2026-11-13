import { Injectable } from '@nestjs/common';
import { EstadoItem, EstadoPedido, Prisma, TipoPedido } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

export const ESTADOS_CERRADOS: EstadoPedido[] = [
  EstadoPedido.ENTREGADO,
  EstadoPedido.CANCELADO,
];

export class DisponibilidadInsuficienteError extends Error {
  constructor(readonly platilloId: number) {
    super('Disponibilidad insuficiente');
  }
}

export class ItemNoModificableError extends Error {
  constructor() {
    super('El ítem ya no se puede modificar');
  }
}

export class PedidoSinItemsError extends Error {
  constructor() {
    super('El pedido no puede quedar sin platillos');
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

export type ItemExistente = {
  id: number;
  platilloId: number;
  cantidad: number;
  estado: EstadoItem;
};

export type CambiosItem = { cantidad?: number; nota?: string | null };

function totalizar(items: ItemNuevo[]): Map<number, number> {
  const porPlatillo = new Map<number, number>();
  for (const item of items) {
    porPlatillo.set(
      item.platilloId,
      (porPlatillo.get(item.platilloId) ?? 0) + item.cantidad,
    );
  }
  return porPlatillo;
}

async function descontar(
  tx: Prisma.TransactionClient,
  sucursalId: number,
  porPlatillo: Map<number, number>,
): Promise<void> {
  for (const [platilloId, cantidad] of porPlatillo) {
    const { count } = await tx.platilloSucursal.updateMany({
      where: { platilloId, sucursalId, disponibilidad: { gte: cantidad } },
      data: { disponibilidad: { decrement: cantidad } },
    });
    if (count === 0) throw new DisponibilidadInsuficienteError(platilloId);
  }
}

async function devolver(
  tx: Prisma.TransactionClient,
  sucursalId: number,
  platilloId: number,
  cantidad: number,
): Promise<void> {
  await tx.platilloSucursal.updateMany({
    where: { platilloId, sucursalId },
    data: { disponibilidad: { increment: cantidad } },
  });
}

async function recalcular(
  tx: Prisma.TransactionClient,
  pedidoId: number,
): Promise<Prisma.Decimal> {
  const detalles = await tx.detallePedido.findMany({
    where: { pedidoId },
    select: { cantidad: true, precioUnitario: true },
  });
  const total = detalles.reduce(
    (suma, d) => suma.plus(d.precioUnitario.mul(d.cantidad)),
    new Prisma.Decimal(0),
  );
  await tx.pedido.update({
    where: { id: pedidoId },
    data: { subtotal: total, total },
  });
  return total;
}

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

  buscarPedido(id: number) {
    return this.prisma.pedido.findUnique({
      where: { id },
      select: { id: true, sucursalId: true, estado: true },
    });
  }

  buscarItem(pedidoId: number, id: number) {
    return this.prisma.detallePedido.findFirst({
      where: { id, pedidoId },
      select: { id: true, platilloId: true, cantidad: true, estado: true },
    });
  }

  crear(datos: DatosPedido) {
    const { sucursalId, mesaId, meseroId, total, items } = datos;

    return this.prisma.$transaction(async (tx) => {
      await descontar(tx, sucursalId, totalizar(items));

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

  agregarItems(pedidoId: number, sucursalId: number, items: ItemNuevo[]) {
    return this.prisma.$transaction(async (tx) => {
      await descontar(tx, sucursalId, totalizar(items));

      const agregados = await tx.detallePedido.createManyAndReturn({
        data: items.map((item) => ({
          pedidoId,
          platilloId: item.platilloId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          nota: item.nota,
        })),
        select: { id: true, platilloId: true, cantidad: true, estado: true },
      });

      const total = await recalcular(tx, pedidoId);

      await tx.pedido.updateMany({
        where: { id: pedidoId, estado: EstadoPedido.LISTO },
        data: { estado: EstadoPedido.ENVIADO_COCINA },
      });

      return { total, agregados };
    });
  }

  cambiarItem(
    pedidoId: number,
    sucursalId: number,
    item: ItemExistente,
    cambios: CambiosItem,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.detallePedido.updateMany({
        where: { id: item.id, pedidoId, estado: EstadoItem.PENDIENTE },
        data: { cantidad: cambios.cantidad, nota: cambios.nota },
      });
      if (count === 0) throw new ItemNoModificableError();

      if (cambios.cantidad !== undefined) {
        const diferencia = cambios.cantidad - item.cantidad;
        if (diferencia > 0) {
          await descontar(
            tx,
            sucursalId,
            new Map([[item.platilloId, diferencia]]),
          );
        } else if (diferencia < 0) {
          await devolver(tx, sucursalId, item.platilloId, -diferencia);
        }
      }

      return recalcular(tx, pedidoId);
    });
  }

  quitarItem(pedidoId: number, sucursalId: number, item: ItemExistente) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.detallePedido.deleteMany({
        where: { id: item.id, pedidoId, estado: EstadoItem.PENDIENTE },
      });
      if (count === 0) throw new ItemNoModificableError();

      const restantes = await tx.detallePedido.count({ where: { pedidoId } });
      if (restantes === 0) throw new PedidoSinItemsError();

      await devolver(tx, sucursalId, item.platilloId, item.cantidad);
      return recalcular(tx, pedidoId);
    });
  }
}