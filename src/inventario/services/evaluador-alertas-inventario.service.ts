import { Injectable } from '@nestjs/common';

@Injectable()
export class EvaluadorAlertasInventario {
  // TODO(H15): BE-15.1 crea o resuelve la alerta del insumo según su cantidad y su mínimo.
  evaluar(_insumoId: number): Promise<void> {
    return Promise.resolve();
  }
}
