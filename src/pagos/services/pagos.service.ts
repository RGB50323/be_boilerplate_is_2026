import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProcesarPagoDto } from '@Pagos/dto';
import { PagoRepository } from '../repositories/pago.repository.js';
import { EstadoPago } from '@PrismaClient';
import {
  PasarelaSimuladaService,
  EstadoTransaccionSimulada,
} from './pasarela-simulada.service.js';

@Injectable()
export class PagosService {
  constructor(
    private readonly pagoRepository: PagoRepository,
    private readonly pasarela: PasarelaSimuladaService,
  ) {}

  async procesarPago(datos: ProcesarPagoDto) {
    const { solicitudId, ticket } = datos;

    // 1. Verificar si la solicitud ya existe
    const pagoExistente =
      await this.pagoRepository.buscarPorSolicitud(solicitudId);

    if (pagoExistente) {
      this.verificarReintento(pagoExistente, ticket);
      return this.respuestaPago(pagoExistente);
    }

    // 2. Verificar que el pedido exista
    const pedido = await this.pagoRepository.buscarPedido(ticket.id);

    if (!pedido) {
      throw new NotFoundException(
        `No existe el pedido ${ticket.id}`,
      );
    }

    // 3. Ejecutar la simulación local
    const resultado = this.pasarela.procesarPago(
      String(ticket.id),
    );

    // 4. Verificar que el simulador devolvió
    // un resultado inicial válido
    if (
      !resultado.transaccionId ||
      resultado.referencia !== String(ticket.id) ||
      resultado.estado !== EstadoTransaccionSimulada.PENDIENTE
    ) {
      throw new BadGatewayException(
        'Respuesta inválida del simulador',
      );
    }

    // 5. Registrar la operación
    try {
      const pago = await this.pagoRepository.crear({
        pedidoId: ticket.id,
        idempotencyKey: solicitudId,
        transaccionId: resultado.transaccionId,
        monto: ticket.total,
        estado: EstadoPago.PENDIENTE,
      });

      return this.respuestaPago(pago);
    } catch (error: unknown) {
      // Manejar solicitudes simultáneas con la misma clave.
      if (this.esConflictoUnico(error)) {
        const existente =
          await this.pagoRepository.buscarPorSolicitud(solicitudId);

        if (existente) {
          this.verificarReintento(existente, ticket);
          return this.respuestaPago(existente);
        }
      }

      throw error;
    }
  }

  // Verifica que una misma clave no se reutilice
  // para pagar otro pedido o un importe distinto.
  private verificarReintento(
    pago: { pedidoId: number; monto: { toString(): string } },
    ticket: ProcesarPagoDto['ticket'],
  ) {
    if (
      pago.pedidoId !== ticket.id ||
      pago.monto.toString() !== ticket.total.toFixed(2)
    ) {
      throw new ConflictException(
        'La solicitud ya existe con datos diferentes',
      );
    }
  }

  private esConflictoUnico(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  // Respuesta que recibirá el módulo solicitante
  private respuestaPago(pago: {
    id: number;
    pedidoId: number;
    transaccionId: string | null;
    estado: EstadoPago;
  }) {
    return {
      pagoId: pago.id,
      ticketId: pago.pedidoId,
      transaccionId: pago.transaccionId,
      estado: pago.estado,
    };
  }
}
