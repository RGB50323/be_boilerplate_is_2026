import type { PedidoCocinaDto } from '@Cocina/dto';

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

export interface CocinaServerToClientEvents {
  'pedido:nuevo': (pedido: PedidoCocinaDto) => void;
  'pedido:actualizado': (pedido: PedidoCocinaDto) => void;
  'pedido:retirado': (payload: { id: number }) => void;
}
