import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoItem, type Prisma } from '@PrismaClient';
import { ESTADOS_EN_COCINA } from '@Cocina/constants';

/** Relaciones que necesita el tablero de cocina. */
const PEDIDO_COCINA_INCLUDE = {
  mesa: { select: { numero: true } },
  detalles: {
    orderBy: { id: 'asc' },
    include: { platillo: { select: { nombre: true } } },
  },
} satisfies Prisma.PedidoInclude;

/** Pedido con mesa y detalles cargados, listo para mapear a PedidoCocinaDto. */
export type PedidoCocina = Prisma.PedidoGetPayload<{
  include: typeof PEDIDO_COCINA_INCLUDE;
}>;

/**
 * Acceso a datos de la cola de cocina.
 *
 * Solo lee: los cambios de estado de pedidos e ítems son de otros flujos.
 */
@Injectable()
export class PedidoCocinaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pedidos pendientes de una sucursal, del más antiguo al más reciente.
   *
   * Los pedidos para llevar sin pago confirmado quedan fuera sin un filtro
   * propio: siguen en PENDIENTE_PAGO, que no está en ESTADOS_EN_COCINA. Esto
   * depende de que el flujo de pagos sea el único que los mueve a
   * ENVIADO_COCINA, y solo después de confirmar el pago. Si ese flujo cambia,
   * hay que agregar acá un filtro por pago CONFIRMADO.
   *
   * Debe coincidir con CocinaService.esVisibleEnCocina, que aplica la misma
   * regla en memoria al decidir qué evento emitir.
   */
  findPendientesBySucursal(sucursalId: number): Promise<PedidoCocina[]> {
    return this.prisma.pedido.findMany({
      where: {
        sucursalId,
        estado: { in: [...ESTADOS_EN_COCINA] },
        detalles: { some: { estado: EstadoItem.PENDIENTE } },
      },
      include: PEDIDO_COCINA_INCLUDE,
      // `id` desempata dos pedidos creados en el mismo milisegundo.
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
