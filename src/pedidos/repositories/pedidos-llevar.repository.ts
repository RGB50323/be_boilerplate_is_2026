import { Injectable } from '@nestjs/common';
import { EstadoPago, EstadoPedido, Prisma, TipoPedido } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import {
  descontar,
  devolver,
  totalizar,
  type ItemNuevo,
} from './pedidos.repository.js';
import { saltoDePagina } from '@Common/paginacion';

export class PedidoNoCancelableError extends Error {
  constructor() {
    super('El pedido ya no se puede cancelar');
  }
}

export type DatosPedidoLlevar = {
  sucursalId: number;
  clienteId: string;
  nombreCliente: string;
  total: Prisma.Decimal;
  items: ItemNuevo[];
};

@Injectable()
export class PedidosLlevarRepository {
  constructor(private readonly prisma: PrismaService) {}

  buscarSucursal(id: number) {
    return this.prisma.sucursal.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  buscarPedido(id: number) {
    return this.prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        sucursalId: true,
        tipo: true,
        estado: true,
        clienteId: true,
      },
    });
  }

  listarPorCliente(clienteId: string, pagina: number, porPagina: number) {
    const where = { clienteId, tipo: TipoPedido.LLEVAR };
    return this.prisma.$transaction([
      this.prisma.pedido.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: saltoDePagina(pagina, porPagina),
        take: porPagina,
        select: {
          id: true,
          numero: true,
          estado: true,
          total: true,
          creadoEn: true,
          sucursal: { select: { nombre: true } },
        },
      }),
      this.prisma.pedido.count({ where }),
    ]);
  }

  crear(datos: DatosPedidoLlevar) {
    const { sucursalId, clienteId, nombreCliente, total, items } = datos;

    return this.prisma.$transaction(async (tx) => {
      await descontar(tx, sucursalId, totalizar(items));

      return tx.pedido.create({
        data: {
          tipo: TipoPedido.LLEVAR,
          estado: EstadoPedido.PENDIENTE_PAGO,
          sucursalId,
          clienteId,
          nombreCliente,
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
        select: { id: true, estado: true, total: true },
      });
    });
  }

  confirmarPago(pedidoId: number) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
        select: { id: true, sucursalId: true, tipo: true, estado: true },
      });
      if (pedido === null || pedido.tipo !== TipoPedido.LLEVAR) return null;

      if (pedido.estado === EstadoPedido.PENDIENTE_PAGO) {
        const confirmados = await tx.pago.count({
          where: { pedidoId, estado: EstadoPago.CONFIRMADO },
        });
        if (confirmados > 0) {
          const numero = `S${pedido.sucursalId}-${String(pedido.id).padStart(6, '0')}`;
          const { count } = await tx.pedido.updateMany({
            where: { id: pedidoId, estado: EstadoPedido.PENDIENTE_PAGO },
            data: { estado: EstadoPedido.RECIBIDO, numero },
          });
          if (count > 0) {
            await tx.detallePedido.updateMany({
              where: { pedidoId },
              data: { enviadoEn: new Date() },
            });
          }
        }
      }

      return tx.pedido.findUniqueOrThrow({
        where: { id: pedidoId },
        select: { id: true, numero: true, estado: true },
      });
    });
  }

  cancelar(pedidoId: number, sucursalId: number) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: EstadoPedido.RECIBIDO },
        data: { estado: EstadoPedido.CANCELADO },
      });
      if (count === 0) throw new PedidoNoCancelableError();

      await tx.pago.updateMany({
        where: { pedidoId, estado: EstadoPago.CONFIRMADO },
        data: { estado: EstadoPago.REEMBOLSADO, reembolsadoEn: new Date() },
      });

      const detalles = await tx.detallePedido.findMany({
        where: { pedidoId },
        select: { platilloId: true, cantidad: true },
      });
      for (const d of detalles) {
        await devolver(tx, sucursalId, d.platilloId, d.cantidad);
      }
    });
  }

  buscarSeguimiento(id: number) {
    return this.prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        estado: true,
        tipo: true,
        clienteId: true,
        nombreCliente: true,
        total: true,
        creadoEn: true,
        sucursal: { select: { nombre: true } },
        pagos: { orderBy: { id: 'desc' }, take: 1, select: { estado: true, comprobante: { select: { id: true } } } },
        detalles: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            platilloId: true,
            cantidad: true,
            precioUnitario: true,
            nota: true,
            estado: true,
            platillo: { select: { nombre: true } },
          },
        },
      },
    });
  }
}
