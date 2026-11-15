import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoPago, Prisma } from '@PrismaClient';
import { ProcesarPagoDto } from '@Pagos/dto';
import { PagoRepository } from '../repositories/pago.repository.js';

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

  // =========================================================
  // BE-16.1: Procesar pago mediante pasarela simulada
  // =========================================================

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
      throw new NotFoundException(`No existe el pedido ${ticket.id}`);
    }

    // 3. Validar el ticket contra los datos de H04
    this.validarTicket(ticket, pedido);

    // 4. Verificar si existe otro pago que impida cobrar
    const pagoBloqueante = await this.pagoRepository.buscarPagoBloqueante(
      ticket.id,
    );

    if (pagoBloqueante) {
      throw new ConflictException(
        `El pedido ${ticket.id} ya tiene un pago en estado ${pagoBloqueante.estado}`,
      );
    }

    // 5. Ejecutar la pasarela simulada
    const resultado = this.pasarela.procesarPago(String(ticket.id));

    // 6. Validar la respuesta inicial del simulador
    if (
      !resultado ||
      !resultado.transaccionId ||
      resultado.referencia !== String(ticket.id) ||
      resultado.estado !== EstadoTransaccionSimulada.PENDIENTE
    ) {
      throw new BadGatewayException('Respuesta inválida del simulador');
    }

    // 7. Registrar el pago
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
      if (this.esConflictoUnico(error)) {
        const existente =
          await this.pagoRepository.buscarPorSolicitud(solicitudId);

        // Misma solicitud: recuperar el pago original
        if (existente) {
          this.verificarReintento(existente, ticket);
          return this.respuestaPago(existente);
        }

        // Otra solicitud: PostgreSQL impidió
        // crear un segundo pago activo para el pedido
        throw new ConflictException(
          'El pedido ya tiene una operación de pago activa',
        );
      }

      throw error;
    }
  }

  // =========================================================
  // Validación del ticket recibido contra el pedido de H04
  // =========================================================

  private validarTicket(
    ticket: ProcesarPagoDto['ticket'],
    pedido: NonNullable<Awaited<ReturnType<PagoRepository['buscarPedido']>>>,
  ): void {
    // Comparar el total recibido con el registrado
    if (!new Prisma.Decimal(ticket.total).eq(pedido.total)) {
      throw new BadRequestException(
        'El total del ticket no coincide con el pedido',
      );
    }

    // Verificar que coincida la cantidad de líneas
    if (ticket.items.length !== pedido.detalles.length) {
      throw new BadRequestException(
        'Los artículos del ticket no coinciden con el pedido',
      );
    }

    // Normalizar las líneas sin depender del orden
    const lineasTicket = ticket.items
      .map((item) => {
        const precio = new Prisma.Decimal(item.precio_unitario);
        const subtotal = new Prisma.Decimal(item.subtotal);

        if (!subtotal.eq(precio.mul(item.cantidad))) {
          throw new BadRequestException(
            'El subtotal de un artículo es incorrecto',
          );
        }

        return JSON.stringify([
          item.nombre,
          precio.toFixed(2),
          item.cantidad,
          subtotal.toFixed(2),
        ]);
      })
      .sort();

    const lineasPedido = pedido.detalles
      .map((detalle) => {
        const subtotal = detalle.precioUnitario.mul(detalle.cantidad);

        return JSON.stringify([
          detalle.platillo.nombre,
          detalle.precioUnitario.toFixed(2),
          detalle.cantidad,
          subtotal.toFixed(2),
        ]);
      })
      .sort();

    // Comparar cada línea del ticket con el pedido
    for (let i = 0; i < lineasTicket.length; i++) {
      if (lineasTicket[i] !== lineasPedido[i]) {
        throw new BadRequestException(
          'El desglose del ticket no coincide con el pedido',
        );
      }
    }
  }

  // =========================================================
  // BE-16.2: Consultar y actualizar transacciones
  // =========================================================

  async consultarTransaccion(transaccionId: string) {
    const pago = await this.pagoRepository.obtenerEstado(transaccionId);

    if (!pago) {
      throw new NotFoundException('No existe la transacción solicitada');
    }

    return pago;
  }

  async cambiarEstadoTransaccion(
    transaccionId: string,
    estadoNuevo: EstadoTransaccionSimulada,
  ) {
    const pago = await this.pagoRepository.buscarPorTransaccion(transaccionId);

    if (!pago) {
      throw new NotFoundException('No existe la transacción solicitada');
    }

    // Validar las transiciones permitidas
    this.pasarela.cambiarEstado(
      pago.estado as EstadoTransaccionSimulada,
      estadoNuevo,
    );

    // Actualizar solamente si el estado no ha cambiado
    const resultado = await this.pagoRepository.actualizarEstado(
      transaccionId,
      pago.estado,
      estadoNuevo as EstadoPago,
    );

    if (resultado.count !== 1) {
      throw new ConflictException(
        'El estado de la transacción cambió durante la operación',
      );
    }

    return this.consultarTransaccion(transaccionId);
  }

  // =========================================================
  // Métodos auxiliares
  // =========================================================

  // Verificar que la clave no se reutilice con otro pedido
  // o con un importe diferente
  private verificarReintento(
    pago: {
      pedidoId: number;
      monto: { toString(): string };
    },
    ticket: ProcesarPagoDto['ticket'],
  ): void {
    if (
      pago.pedidoId !== ticket.id ||
      pago.monto.toString() !== ticket.total.toFixed(2)
    ) {
      throw new ConflictException(
        'La solicitud ya existe con datos diferentes',
      );
    }
  }

  // Identificar errores de unicidad de Prisma
  private esConflictoUnico(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  // Preparar la respuesta para el módulo solicitante
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
