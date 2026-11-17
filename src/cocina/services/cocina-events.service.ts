import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CocinaEvento,
  type PedidoCocinaEvento,
  type PedidoRetiradoEvento,
} from '@Cocina/events';
import { PedidoCocinaRepository, type PedidoCocina } from '@Cocina/repositories';
import { CocinaService } from './cocina.service.js';

@Injectable()
export class CocinaEventsService {
  private readonly logger = new Logger(CocinaEventsService.name);

  constructor(
    private readonly pedidoCocinaRepository: PedidoCocinaRepository,
    private readonly cocinaService: CocinaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

  async pedidoActualizado(pedidoId: number): Promise<void> {
    const pedido = await this.pedidoCocinaRepository.findById(pedidoId);
    if (!pedido) {
      this.logger.warn(`pedidoActualizado: no existe el pedido ${pedidoId}.`);
      return;
    }
    this.publicarCambio(pedido);
  }

  async platilloListo(pedidoId: number, pedidoCompletado: boolean): Promise<void> {
    const pedido = await this.pedidoCocinaRepository.findById(pedidoId);
    if (!pedido) {
      this.logger.warn(`platilloListo: no existe el pedido ${pedidoId}.`);
      return;
    }

    const evento = {
      sucursalId: pedido.sucursalId,
      pedido: this.cocinaService.toDto(pedido),
    } satisfies PedidoCocinaEvento;
    this.eventEmitter.emit(CocinaEvento.ITEM_LISTO, evento);
    if (pedidoCompletado) {
      this.eventEmitter.emit(CocinaEvento.PEDIDO_LISTO, evento);
    }
    this.publicarCambio(pedido);
  }

  private publicarCambio(pedido: PedidoCocina): void {
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
