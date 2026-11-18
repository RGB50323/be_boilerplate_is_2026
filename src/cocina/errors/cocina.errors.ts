export class ItemNoEncontradoError extends Error {
  constructor(readonly itemId: number) {
    super(`El ítem ${itemId} no existe.`);
    this.name = 'ItemNoEncontradoError';
  }
}

export class ItemDeOtraSucursalError extends Error {
  constructor(readonly itemId: number) {
    super(`El ítem ${itemId} pertenece a otra sucursal.`);
    this.name = 'ItemDeOtraSucursalError';
  }
}

export class ItemNoPendienteError extends Error {
  constructor(readonly itemId: number) {
    super(`El ítem ${itemId} ya no está pendiente.`);
    this.name = 'ItemNoPendienteError';
  }
}

export class PedidoFueraDeCocinaError extends Error {
  constructor(readonly pedidoId: number) {
    super(`El pedido ${pedidoId} no está en cocina.`);
    this.name = 'PedidoFueraDeCocinaError';
  }
}
