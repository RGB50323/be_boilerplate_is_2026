import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
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
import { esSnapshotPdf } from '../../comprobantes/services/comprobante-pdf.snapshot.js';
import {
  correoLealtadDelSnapshot,
  type TicketSnapshot,
} from '../types/ticket-snapshot.js';
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
    if (datos.correoLealtad && pedido.tipo !== TipoPedido.MESA) {
      throw new BadRequestException(
        'correoLealtad solo se admite en pagos de mesa',
      );
    }
    const correoLealtad = datos.correoLealtad?.toLowerCase();

    const metodo = datos.metodo ?? 'TARJETA';
    const detallePago = this.prepararDetallePago(
      datos,
      pedido.tipo,
      pedido.total,
    );

    // 3. Verificar idempotencia
    const pagoExistente =
      await this.pagoRepository.buscarPorSolicitud(solicitudId);

    if (pagoExistente) {
      this.verificarReintento(
        pagoExistente,
        ticket,
        metodo,
        detallePago,
        correoLealtad,
      );
      await this.recuperarPedidoLlevar(pedido, pagoExistente.estado);
      return this.respuestaPago(pagoExistente);
    }

    // 4. Validar estado y contenido del ticket
    const ticketSnapshot = this.validarTicket(ticket, pedido);

    // 5. Verificar si hay otro pago que impida cobrar
    const pagoBloqueante = await this.pagoRepository.buscarPagoBloqueante(
      ticket.id,
    );

    if (pagoBloqueante) {
      const existente =
        await this.pagoRepository.buscarPorSolicitud(solicitudId);
      if (existente) {
        this.verificarReintento(
          existente,
          ticket,
          metodo,
          detallePago,
          correoLealtad,
        );
        await this.recuperarPedidoLlevar(pedido, existente.estado);
        return this.respuestaPago(existente);
      }
      throw new ConflictException(
        `El pedido ${ticket.id} ya tiene un pago en estado ${pagoBloqueante.estado}`,
      );
    }

    // 6. Ejecutar la pasarela simulada
    const resultado =
      metodo === 'TARJETA'
        ? this.pasarela.procesarPago(String(ticket.id))
        : null;

    // 7. Validar respuesta inicial del simulador
    if (
      metodo === 'TARJETA' &&
      (!resultado ||
        !resultado.transaccionId ||
        resultado.referencia !== String(ticket.id) ||
        resultado.estado !== EstadoTransaccionSimulada.PENDIENTE)
    ) {
      throw new BadGatewayException('Respuesta inválida del simulador');
    }

    // H17 conserva el ticket validado al iniciar el pago.
    // 8. Registrar el pago PENDIENTE junto con su ticket validado para que H17
    // pueda emitir luego a partir de los datos aceptados al iniciar el pago.
    try {
      const pago = await this.pagoRepository.crear({
        pedidoId: ticket.id,
        pedidoActualizadoEn: pedido.actualizadoEn,
        idempotencyKey: solicitudId,
        transaccionId: resultado?.transaccionId ?? randomUUID(),
        monto: pedido.total,
        estado:
          metodo === 'EFECTIVO' ? EstadoPago.CONFIRMADO : EstadoPago.PENDIENTE,
        metodo,
        detallePago,
        ticketSnapshot: correoLealtad
          ? { ...ticketSnapshot, correoLealtad }
          : ticketSnapshot,
      });

      return this.respuestaPago(pago);
    } catch (error: unknown) {
      if (error instanceof ConflictException || this.esConflictoUnico(error)) {
        const existente =
          await this.pagoRepository.buscarPorSolicitud(solicitudId);

        // Recuperar operación anterior con la misma clave
        if (existente) {
          this.verificarReintento(
            existente,
            ticket,
            metodo,
            detallePago,
            correoLealtad,
          );
          await this.recuperarPedidoLlevar(pedido, existente.estado);
          return this.respuestaPago(existente);
        }

        if (error instanceof ConflictException) throw error;
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
    pedido: NonNullable<Awaited<ReturnType<PagoRepository['buscarPedido']>>>,
  ): TicketSnapshot {
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

    if (
      pedido.tipo === TipoPedido.MESA &&
      pedido.estado !== EstadoPedido.ENTREGADO
    ) {
      throw new ConflictException('El pedido de mesa debe estar entregado');
    }

    if (!pedido.total.gt(0)) {
      throw new BadRequestException(
        'El total del pedido debe ser mayor que cero',
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

    for (const item of ticket.items) {
      const subtotal = new Prisma.Decimal(item.precio_unitario).mul(
        item.cantidad,
      );
      if (!subtotal.eq(item.subtotal)) {
        throw new BadRequestException(
          'El subtotal de un art\u00edculo es incorrecto',
        );
      }
    }

    const items = pedido.detalles.map((detalle) => ({
      platilloId: detalle.platillo.id,
      nombre: detalle.platillo.nombre,
      cantidad: detalle.cantidad,
      precioUnitario: detalle.precioUnitario.toFixed(2),
      subtotal: detalle.precioUnitario.mul(detalle.cantidad).toFixed(2),
    }));

    if (!this.coincidenItems(ticket.items, items)) {
      throw new BadRequestException(
        'El desglose del ticket no coincide con el pedido',
      );
    }

    return {
      version: 1,
      pedidoId: pedido.id,
      items,
      total: pedido.total.toFixed(2),
    };
  }

  // =========================================================
  // BE-16.2: Consultar y actualizar transacciones
  // =========================================================

  async consultarPorPedido(pedidoId: number, usuario: User) {
    if (!Number.isInteger(pedidoId) || pedidoId < 1 || pedidoId > 2147483647) {
      throw new NotFoundException('No existe el pedido');
    }
    const pedido = await this.pagoRepository.buscarTitularPedido(pedidoId);
    if (!pedido) throw new NotFoundException('No existe el pedido');

    const autorizado =
      usuario.rol === Rol.GERENTE_GENERAL ||
      (usuario.rol === Rol.GERENTE &&
        usuario.sucursalId === pedido.sucursalId) ||
      (usuario.rol === Rol.MESERO &&
        pedido.tipo === TipoPedido.MESA &&
        usuario.sucursalId === pedido.sucursalId) ||
      (usuario.rol === Rol.CLIENTE &&
        pedido.tipo === TipoPedido.LLEVAR &&
        pedido.clienteId === usuario.id);
    if (!autorizado)
      throw new ForbiddenException(
        'No tienes permiso para consultar este pago',
      );

    const pago = await this.pagoRepository.buscarPagoRelevante(pedidoId);
    if (!pago) return { pago: null };
    const { ticketId, ...resultado } = this.respuestaPago(pago);
    return { ...resultado, pedidoId: ticketId, metodo: pago.metodo };
  }

  async consultarTransaccion(transaccionId: string, usuario: User) {
    if (usuario.rol !== Rol.MESERO && !this.esGerencia(usuario)) {
      throw new ForbiddenException(
        'No tienes permiso para consultar esta transacción',
      );
    }

    const pago = await this.pagoRepository.obtenerEstado(transaccionId);

    if (!pago) {
      throw new NotFoundException('No existe la transacción solicitada');
    }

    this.validarSucursalTransaccion(usuario, pago.pedido.sucursalId);
    if (usuario.rol === Rol.MESERO && pago.pedido.tipo !== TipoPedido.MESA) {
      throw new ForbiddenException(
        'No tienes permiso para consultar esta transacción',
      );
    }

    const { comprobante, pedido: _pedido, ...datos } = pago;
    return { ...datos, comprobanteId: comprobante?.id ?? null };
  }

  async cambiarEstadoTransaccion(
    transaccionId: string,
    estadoNuevo: EstadoTransaccionSimulada,
    usuario: User,
  ) {
    if (!this.esGerencia(usuario)) {
      throw new ForbiddenException(
        'No tienes permiso para cambiar esta transacción',
      );
    }

    const pago = await this.pagoRepository.buscarPorTransaccion(transaccionId);

    if (!pago) {
      throw new NotFoundException('No existe la transacción solicitada');
    }

    this.validarSucursalTransaccion(usuario, pago.pedido.sucursalId);

    if (pago.metodo === 'EFECTIVO') {
      throw new ConflictException(
        'La transacción no pertenece a la pasarela simulada',
      );
    }
    if (
      pago.pedido.tipo === TipoPedido.LLEVAR &&
      pago.estado === EstadoPago.CONFIRMADO &&
      estadoNuevo === EstadoTransaccionSimulada.CONFIRMADO
    ) {
      await this.pedidosLlevarService.confirmarPago(pago.pedidoId);
      return this.consultarTransaccion(transaccionId, usuario);
    }

    if (!(await this.aplicarEstado(transaccionId, pago, estadoNuevo))) {
      throw new ConflictException(
        'El estado de la transacción cambió durante la operación',
      );
    }
    return this.consultarTransaccion(transaccionId, usuario);
  }

  async resolverTarjetaSimulada(
    transaccionId: string,
    resultado:
      | EstadoTransaccionSimulada.CONFIRMADO
      | EstadoTransaccionSimulada.RECHAZADO,
  ) {
    const pago = await this.pagoRepository.buscarPorTransaccion(transaccionId);
    if (!pago || pago.metodo !== 'TARJETA') return;
    if (pago.estado === EstadoPago.PENDIENTE) {
      await this.aplicarEstado(transaccionId, pago, resultado);
    } else if (
      pago.estado === EstadoPago.CONFIRMADO &&
      pago.pedido.tipo === TipoPedido.LLEVAR
    ) {
      // Recupera H05 si el proceso se detuvo después de emitir el comprobante.
      await this.pedidosLlevarService.confirmarPago(pago.pedidoId);
    }
  }

  private async aplicarEstado(
    transaccionId: string,
    pago: NonNullable<
      Awaited<ReturnType<PagoRepository['buscarPorTransaccion']>>
    >,
    estadoNuevo: EstadoTransaccionSimulada,
  ): Promise<boolean> {
    this.pasarela.cambiarEstado(
      pago.estado as EstadoTransaccionSimulada,
      estadoNuevo,
    );

    const resultado =
      estadoNuevo === EstadoTransaccionSimulada.CONFIRMADO
        ? await this.pagoRepository.confirmarYEmitirComprobante(
            transaccionId,
            pago.estado,
          )
        : await this.pagoRepository.actualizarEstado(
            transaccionId,
            pago.estado,
            estadoNuevo,
          );

    if (resultado.count !== 1) return false;
    if (
      estadoNuevo === EstadoTransaccionSimulada.CONFIRMADO &&
      pago.pedido.tipo === TipoPedido.LLEVAR
    ) {
      await this.pedidosLlevarService.confirmarPago(pago.pedidoId);
    }
    return true;
  }

  // =========================================================
  // Métodos auxiliares
  // =========================================================

  private esGerencia(usuario: User) {
    return usuario.rol === Rol.GERENTE || usuario.rol === Rol.GERENTE_GENERAL;
  }

  private validarSucursalTransaccion(usuario: User, sucursalId: number) {
    if (
      usuario.rol !== Rol.GERENTE_GENERAL &&
      usuario.sucursalId !== sucursalId
    ) {
      throw new ForbiddenException('La transacción pertenece a otra sucursal');
    }
  }

  private prepararDetallePago(
    datos: ProcesarPagoDto,
    tipo: TipoPedido,
    total: Prisma.Decimal,
  ): Prisma.InputJsonObject | undefined {
    const { metodo, montoRecibido, marca, ultimosCuatro } = datos;
    if (metodo === 'EFECTIVO') {
      if (
        tipo !== TipoPedido.MESA ||
        typeof montoRecibido !== 'string' ||
        marca != null ||
        ultimosCuatro != null
      ) {
        throw new BadRequestException(
          'El efectivo requiere montoRecibido y un pedido de mesa',
        );
      }
      const recibido = new Prisma.Decimal(montoRecibido);
      if (recibido.lt(total)) {
        throw new BadRequestException(
          'El monto recibido es inferior al total del pedido',
        );
      }
      return {
        montoRecibido: recibido.toFixed(2),
        cambio: recibido.minus(total).toFixed(2),
      };
    }

    if (
      montoRecibido != null ||
      ((metodo != null || marca != null || ultimosCuatro != null) &&
        (!marca || !ultimosCuatro))
    ) {
      throw new BadRequestException(
        'La tarjeta simulada requiere marca y últimos cuatro dígitos',
      );
    }
    return marca && ultimosCuatro ? { marca, ultimosCuatro } : undefined;
  }

  private async recuperarPedidoLlevar(
    pedido: { id: number; tipo: TipoPedido; estado: EstadoPedido },
    estadoPago: EstadoPago,
  ) {
    if (
      pedido.tipo === TipoPedido.LLEVAR &&
      pedido.estado === EstadoPedido.PENDIENTE_PAGO &&
      estadoPago === EstadoPago.CONFIRMADO
    ) {
      await this.pedidosLlevarService.confirmarPago(pedido.id);
    }
  }

  private verificarReintento(
    pago: {
      pedidoId: number;
      monto: Prisma.Decimal;
      metodo?: string | null;
      detallePago?: Prisma.JsonValue;
      ticketSnapshot?: Prisma.JsonValue;
    },
    ticket: ProcesarPagoDto['ticket'],
    metodo: string,
    detallePago?: Prisma.InputJsonObject,
    correoLealtad?: string,
  ): void {
    const snapshot = pago.ticketSnapshot ?? null;
    if (
      pago.pedidoId !== ticket.id ||
      !new Prisma.Decimal(ticket.total).eq(pago.monto) ||
      (pago.metodo ?? 'TARJETA') !== metodo ||
      !isDeepStrictEqual(pago.detallePago ?? null, detallePago ?? null) ||
      correoLealtadDelSnapshot(snapshot) !== correoLealtad ||
      (esSnapshotPdf(snapshot) &&
        !this.coincidenItems(ticket.items, snapshot.items))
    ) {
      throw new ConflictException(
        'La solicitud ya existe con datos diferentes',
      );
    }
  }

  private coincidenItems(
    ticket: ProcesarPagoDto['ticket']['items'],
    historico: Pick<
      TicketSnapshot['items'][number],
      'nombre' | 'precioUnitario' | 'cantidad' | 'subtotal'
    >[],
  ) {
    const solicitados = ticket
      .map(({ nombre, precio_unitario, cantidad, subtotal }) =>
        JSON.stringify([
          nombre,
          new Prisma.Decimal(precio_unitario).toFixed(2),
          cantidad,
          new Prisma.Decimal(subtotal).toFixed(2),
        ]),
      )
      .sort();
    const persistidos = historico
      .map(({ nombre, precioUnitario, cantidad, subtotal }) =>
        JSON.stringify([nombre, precioUnitario, cantidad, subtotal]),
      )
      .sort();
    return isDeepStrictEqual(solicitados, persistidos);
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
    comprobante?: { id: number } | null;
  }) {
    return {
      pagoId: pago.id,
      ticketId: pago.pedidoId,
      transaccionId: pago.transaccionId,
      estado: pago.estado,
      comprobanteId: pago.comprobante?.id ?? null,
    };
  }

  // =========================================================
  // Autorización de operaciones
  // =========================================================

  private validarAutorizacion(
    pedido: NonNullable<Awaited<ReturnType<PagoRepository['buscarPedido']>>>,
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

      throw new ForbiddenException('No tienes permiso para pagar este pedido');
    }

    // Pedidos en mesa
    if (pedido.tipo === TipoPedido.MESA) {
      if (usuario.rol === Rol.MESERO || usuario.rol === Rol.GERENTE) {
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

    throw new ForbiddenException('No tienes permiso para procesar este pago');
  }
}
