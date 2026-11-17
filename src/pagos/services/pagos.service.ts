
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoPago,
  EstadoPedido,
  Prisma,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';

import { ProcesarPagoDto } from '@Pagos/dto';
import { PagoRepository } from '../repositories/pago.repository.js';
import { PedidosLlevarService } from '../../pedidos/services/pedidos-llevar.service.js';

import {
  PasarelaSimuladaService,
  EstadoTransaccionSimulada,
} from './pasarela-simulada.service.js';

@Injectable()
export class PagosService {
  constructor(
    private readonly pagoRepository: PagoRepository,
    private readonly pasarela: PasarelaSimuladaService,
    private readonly pedidosLlevarService: PedidosLlevarService,
  ) {}

  // =========================================================
  // BE-16.1: Procesar pago mediante pasarela simulada
  // =========================================================

  async procesarPago(datos: ProcesarPagoDto, usuario: User) {
    const { solicitudId, ticket } = datos;

    // 1. Verificar que el pedido exista
    const pedido = await this.pagoRepository.buscarPedido(ticket.id);

    if (!pedido) {
      throw new NotFoundException(`No existe el pedido ${ticket.id}`);
    }

    // 2. Verificar autorización antes de devolver cualquier pago
    this.validarAutorizacion(pedido, usuario);

    // 3. Verificar idempotencia
    const pagoExistente =
      await this.pagoRepository.buscarPorSolicitud(solicitudId);

    if (pagoExistente) {
      this.verificarReintento(pagoExistente, ticket);
      return this.respuestaPago(pagoExistente);
    }

    // 4. Validar estado y contenido del ticket
    this.validarTicket(ticket, pedido);

    // 5. Verificar si hay otro pago que impida cobrar
    const pagoBloqueante = await this.pagoRepository.buscarPagoBloqueante(
      ticket.id,
    );

    if (pagoBloqueante) {
      throw new ConflictException(
        `El pedido ${ticket.id} ya tiene un pago en estado ${pagoBloqueante.estado}`,
      );
    }

    // 6. Ejecutar la pasarela simulada
    const resultado = this.pasarela.procesarPago(String(ticket.id));

    // 7. Validar respuesta inicial del simulador
    if (
      !resultado ||
      !resultado.transaccionId ||
      resultado.referencia !== String(ticket.id) ||
      resultado.estado !== EstadoTransaccionSimulada.PENDIENTE
    ) {
      throw new BadGatewayException('Respuesta inválida del simulador');
    }

    // 8. Registrar el pago
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

        // Recuperar operación anterior con la misma clave
        if (existente) {
          this.verificarReintento(existente, ticket);
          return this.respuestaPago(existente);
        }

        throw new ConflictException(
          'El pedido ya tiene una operación de pago activa',
        );
      }

      throw error;
    }
  }

  // =========================================================
  // Validación del ticket contra H04
  // =========================================================

  private validarTicket(
    ticket: ProcesarPagoDto['ticket'],
    pedido: NonNullable<
      Awaited<ReturnType<PagoRepository['buscarPedido']>>
    >,
  ): void {
    if (pedido.estado === EstadoPedido.CANCELADO) {
      throw new ConflictException(
        'No se puede procesar el pago de un pedido cancelado',
      );
    }

    if (
      pedido.tipo === TipoPedido.LLEVAR &&
      pedido.estado !== EstadoPedido.PENDIENTE_PAGO
    ) {
      throw new ConflictException(
        'El pedido para llevar no está pendiente de pago',
      );
    }

    if (!new Prisma.Decimal(ticket.total).eq(pedido.total)) {
      throw new BadRequestException(
        'El total del ticket no coincide con el pedido',
      );
    }

    if (ticket.items.length !== pedido.detalles.length) {
      throw new BadRequestException(
        'Los artículos del ticket no coinciden con el pedido',
      );
    }

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
    const pago =
      await this.pagoRepository.buscarPorTransaccion(transaccionId);

    if (!pago) {
      throw new NotFoundException('No existe la transacción solicitada');
    }

    // Validar transición de la pasarela
    this.pasarela.cambiarEstado(
      pago.estado as EstadoTransaccionSimulada,
      estadoNuevo,
    );

    // Actualización condicionada al estado anterior
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

    // Integración con H05 para pedidos para llevar
    if (
      estadoNuevo === EstadoTransaccionSimulada.CONFIRMADO &&
      pago.pedido.tipo === TipoPedido.LLEVAR
    ) {
      await this.pedidosLlevarService.confirmarPago(pago.pedidoId);
    }

    return this.consultarTransaccion(transaccionId);
  }

  // =========================================================
  // Métodos auxiliares
  // =========================================================

  private verificarReintento(
    pago: {
      pedidoId: number;
      monto: Prisma.Decimal;
    },
    ticket: ProcesarPagoDto['ticket'],
  ): void {
    if (
      pago.pedidoId !== ticket.id ||
      !new Prisma.Decimal(ticket.total).eq(pago.monto)
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

  // =========================================================
  // Autorización de operaciones
  // =========================================================

private validarAutorizacion(
  pedido: NonNullable<
    Awaited<ReturnType<PagoRepository['buscarPedido']>>
  >,
  usuario: User,
  ): void {
    // Pedidos para llevar
    if (pedido.tipo === TipoPedido.LLEVAR) {
      if (usuario.rol === Rol.CLIENTE) {
        if (pedido.clienteId !== usuario.id) {
          throw new ForbiddenException(
            'No tienes permiso para pagar este pedido',
          );
        }
        return;
      }

      if (usuario.rol === Rol.GERENTE_GENERAL) {
        return;
      }

      throw new ForbiddenException(
        'No tienes permiso para pagar este pedido',
      );
    }

    // Pedidos en mesa
    if (pedido.tipo === TipoPedido.MESA) {
      if (
        usuario.rol === Rol.MESERO ||
        usuario.rol === Rol.GERENTE
      ) {
        if (
          usuario.sucursalId === null ||
          usuario.sucursalId !== pedido.sucursalId
        ) {
          throw new ForbiddenException(
            'No tienes permiso para pagar pedidos de esta sucursal',
          );
        }
        return;
      }

      if (usuario.rol === Rol.GERENTE_GENERAL) {
        return;
      }
    }

    throw new ForbiddenException(
      'No tienes permiso para procesar este pago',
    );
  }
}