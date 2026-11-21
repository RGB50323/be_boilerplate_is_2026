import {
  EstadoItem,
  EstadoPago,
  EstadoPedido,
  TipoPedido,
  type Prisma,
} from '@PrismaClient';

export async function cerrarPedidoLlevarListo(
  tx: Prisma.TransactionClient,
  pedidoId: number,
) {
  const { count } = await tx.pedido.updateMany({
    where: {
      id: pedidoId,
      tipo: TipoPedido.LLEVAR,
      estado: EstadoPedido.LISTO,
      detalles: {
        some: { estado: EstadoItem.LISTO },
        every: { estado: EstadoItem.LISTO },
      },
      pagos: { some: { estado: EstadoPago.CONFIRMADO } },
    },
    data: { estado: EstadoPedido.CERRADO },
  });
  return count === 1;
}
