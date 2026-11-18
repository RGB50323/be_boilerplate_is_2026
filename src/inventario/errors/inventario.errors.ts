export class InsumoDuplicadoError extends Error {
  constructor(readonly nombre: string) {
    super(`Ya existe un insumo llamado "${nombre}" en la sucursal.`);
    this.name = 'InsumoDuplicadoError';
  }
}

export class InsumoNoEncontradoError extends Error {
  constructor(readonly insumoId: number) {
    super(`El insumo ${insumoId} no existe.`);
    this.name = 'InsumoNoEncontradoError';
  }
}

export class InsumoDeOtraSucursalError extends Error {
  constructor(readonly insumoId: number) {
    super(`El insumo ${insumoId} es de otra sucursal.`);
    this.name = 'InsumoDeOtraSucursalError';
  }
}

export class ExistenciaInsuficienteError extends Error {
  constructor(readonly insumoId: number) {
    super(`La salida supera la existencia del insumo ${insumoId}.`);
    this.name = 'ExistenciaInsuficienteError';
  }
}

export class CantidadMaximaExcedidaError extends Error {
  constructor(readonly insumoId: number) {
    super(`La entrada deja al insumo ${insumoId} por encima del máximo permitido.`);
    this.name = 'CantidadMaximaExcedidaError';
  }
}
