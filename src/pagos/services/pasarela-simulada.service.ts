
import { ConflictException, Injectable } from '@nestjs/common';
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

  cambiarEstado(
    estadoActual: EstadoTransaccionSimulada,
    estadoNuevo: EstadoTransaccionSimulada,
  ): EstadoTransaccionSimulada {
    const transicionesPermitidas: Record<
      EstadoTransaccionSimulada,
      EstadoTransaccionSimulada[]
    > = {
      [EstadoTransaccionSimulada.PENDIENTE]: [
        EstadoTransaccionSimulada.CONFIRMADO,
        EstadoTransaccionSimulada.RECHAZADO,
      ],
      [EstadoTransaccionSimulada.CONFIRMADO]: [
        EstadoTransaccionSimulada.REEMBOLSADO,
      ],
      [EstadoTransaccionSimulada.RECHAZADO]: [],
      [EstadoTransaccionSimulada.REEMBOLSADO]: [],
    };

    if (!transicionesPermitidas[estadoActual].includes(estadoNuevo)) {
      throw new ConflictException(
        `No se permite cambiar el estado de ${estadoActual} a ${estadoNuevo}`,
      );
    }

    return estadoNuevo;
  }
}
