import type { PedidoCocinaDto } from '@Cocina/dto';

/**
 * Eventos internos (EventEmitter2) de la cola de cocina.
 *
 * Los publica CocinaEventsService y los escucha CocinaGateway, que los
 * reenvía por Socket.IO. Así quien cambia un pedido no depende del transporte.
 */
export const CocinaEvento = {
  PEDIDO_NUEVO: 'cocina.pedido.nuevo',
  PEDIDO_ACTUALIZADO: 'cocina.pedido.actualizado',
  PEDIDO_RETIRADO: 'cocina.pedido.retirado',
} as const;

export interface PedidoCocinaEvento {
  sucursalId: number;
  pedido: PedidoCocinaDto;
}

export interface PedidoRetiradoEvento {
  sucursalId: number;
  pedidoId: number;
}

/** Eventos que el servidor emite a los clientes del namespace `/cocina`. */
export interface CocinaServerToClientEvents {
  'pedido:nuevo': (pedido: PedidoCocinaDto) => void;
  'pedido:actualizado': (pedido: PedidoCocinaDto) => void;
  'pedido:retirado': (payload: { id: number }) => void;
}
