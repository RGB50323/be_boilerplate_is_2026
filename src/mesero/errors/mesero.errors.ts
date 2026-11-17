export class ItemYaEntregadoError extends Error {
  constructor(readonly itemId: number) {
    super(`El ítem ${itemId} ya fue entregado.`);
    this.name = 'ItemYaEntregadoError';
  }
}

export class ItemNoListoError extends Error {
  constructor(readonly itemId: number) {
    super(`El ítem ${itemId} todavía no está listo.`);
    this.name = 'ItemNoListoError';
  }
}

export class PedidoCanceladoError extends Error {
  constructor(readonly pedidoId: number) {
    super(`El pedido ${pedidoId} está cancelado.`);
    this.name = 'PedidoCanceladoError';
  }
}
