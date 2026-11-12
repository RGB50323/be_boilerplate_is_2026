import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export enum EstadoTransaccionSimulada {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADO = 'CONFIRMADO',
  RECHAZADO = 'RECHAZADO',
  REEMBOLSADO = 'REEMBOLSADO',
}

export interface ResultadoTransaccionSimulada {
  transaccionId: string;
  estado: EstadoTransaccionSimulada;
  referencia: string;
}

@Injectable()
export class PasarelaSimuladaService {
  procesarPago(referencia: string): ResultadoTransaccionSimulada {
    return {
      transaccionId: randomUUID(),
      estado: EstadoTransaccionSimulada.PENDIENTE,
      referencia,
    };
  }
}
