import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoItem, EstadoPago, TipoPedido, type Prisma } from '@PrismaClient';
import { ESTADOS_EN_COCINA } from '@Cocina/constants';

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

  findById(id: number): Promise<PedidoCocina | null> {
    return this.prisma.pedido.findUnique({
      where: { id },
      include: PEDIDO_COCINA_INCLUDE,
    });
  }
}
