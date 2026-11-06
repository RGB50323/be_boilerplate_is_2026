import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CocinaEvento,
  type PedidoCocinaEvento,
  type PedidoRetiradoEvento,
} from '@Cocina/events';
import { PedidoCocinaRepository } from '@Cocina/repositories';
import { CocinaService } from './cocina.service.js';

/**
 * Punto de integración para avisarle a cocina que un pedido cambió.
 *
 * Los flujos que modifican pedidos lo llaman después de confirmar su
 * transacción, con el id del pedido:
 *
 * - Pedidos / pagos: `pedidoEnviadoACocina(id)` cuando el pedido pasa a
 *   ENVIADO_COCINA (para llevar: recién después de confirmar el pago).
 * - Marcar ítem listo o entregado, cancelar o editar el pedido:
 *   `pedidoActualizado(id)`.
 *
 * Este servicio relee el pedido, decide qué evento corresponde y lo publica
 * en EventEmitter2. CocinaGateway lo reenvía a la room de la sucursal. Quien
 * llama no necesita saber si el pedido sigue visible ni cómo se transmite.
 */
@Injectable()
export class CocinaEventsService {
  private readonly logger = new Logger(CocinaEventsService.name);

  constructor(
    private readonly pedidoCocinaRepository: PedidoCocinaRepository,
    private readonly cocinaService: CocinaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Publica `pedido:nuevo` si el pedido ya está visible para cocina. Si no lo
   * está (por ejemplo, un pedido para llevar todavía sin pagar), no emite nada.
   */
  async pedidoEnviadoACocina(pedidoId: number): Promise<void> {
    const pedido = await this.pedidoCocinaRepository.findById(pedidoId);
    if (!pedido) {
      this.logger.warn(`pedidoEnviadoACocina: no existe el pedido ${pedidoId}.`);
      return;
    }
    if (!this.cocinaService.esVisibleEnCocina(pedido)) return;

    this.eventEmitter.emit(CocinaEvento.PEDIDO_NUEVO, {
      sucursalId: pedido.sucursalId,
      pedido: this.cocinaService.toDto(pedido),
    } satisfies PedidoCocinaEvento);
  }

  /**
   * Publica `pedido:actualizado` si el pedido sigue en la cola, o
   * `pedido:retirado` si salió (sin ítems PENDIENTE, cancelado, entregado).
   *
   * Un retiro de un pedido que nunca estuvo en la cola es inofensivo: el
   * tablero lo ignora porque no lo tiene.
   */
  async pedidoActualizado(pedidoId: number): Promise<void> {
    const pedido = await this.pedidoCocinaRepository.findById(pedidoId);
    if (!pedido) {
      this.logger.warn(`pedidoActualizado: no existe el pedido ${pedidoId}.`);
      return;
    }

    if (this.cocinaService.esVisibleEnCocina(pedido)) {
      this.eventEmitter.emit(CocinaEvento.PEDIDO_ACTUALIZADO, {
        sucursalId: pedido.sucursalId,
        pedido: this.cocinaService.toDto(pedido),
      } satisfies PedidoCocinaEvento);
      return;
    }

    this.eventEmitter.emit(CocinaEvento.PEDIDO_RETIRADO, {
      sucursalId: pedido.sucursalId,
      pedidoId: pedido.id,
    } satisfies PedidoRetiradoEvento);
  }
}
