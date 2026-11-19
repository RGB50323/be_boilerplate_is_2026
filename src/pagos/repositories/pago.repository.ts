import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { isDeepStrictEqual } from 'node:util';
import { EstadoPago, EstadoPedido, TipoPedido, Prisma } from '@PrismaClient';
import { ComprobantesService } from '../../comprobantes/services/comprobantes.service.js';
import type { TicketSnapshot } from '../types/ticket-snapshot.js';

//----------------------------------------------------------------------------

interface CrearPagoData {
  pedidoId: number;
  pedidoActualizadoEn: Date;
  idempotencyKey: string;
  transaccionId: string;
  monto: Prisma.Decimal;
  estado: EstadoPago;
  ticketSnapshot: TicketSnapshot;
  metodo: 'EFECTIVO' | 'TARJETA';
  detallePago?: Prisma.InputJsonObject;
}

//----------------------------------------------------------------------------

@Injectable()
export class PagoRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comprobantesService: ComprobantesService,
  ) {}

  // Buscar una operación previamente registrada
  buscarPorSolicitud(idempotencyKey: string) {
    return this.prisma.pago.findUnique({
      where: { idempotencyKey },
      include: { comprobante: { select: { id: true } } },
    });
  }

  // Obtener el pedido y su desglose para validar el ticket
  buscarPedido(pedidoId: number) {
    return this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        numero: true,
        tipo: true,
        estado: true,
        clienteId: true,
        total: true,
        sucursalId: true,
        actualizadoEn: true,

        detalles: {
          select: {
            id: true,
            cantidad: true,
            precioUnitario: true,
            estado: true,
            platillo: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });
  }

  // Registrar una nueva transacción simulada
  crear(data: CrearPagoData) {
    return this.prisma.$transaction(async (tx) => {
      const { pedidoActualizadoEn, ...datosPago } = data;
      const [pedido] = await tx.$queryRaw<
        { actualizadoEn: Date; estado: EstadoPedido }[]
      >(Prisma.sql`
        SELECT actualizado_en AS "actualizadoEn", estado::text AS estado
        FROM pedido WHERE id = ${data.pedidoId} FOR NO KEY UPDATE
      `);
      if (
        !pedido ||
        pedido.actualizadoEn.getTime() !== pedidoActualizadoEn.getTime() ||
        (pedido.estado !== EstadoPedido.ENTREGADO &&
          pedido.estado !== EstadoPedido.PENDIENTE_PAGO)
      ) {
        throw new ConflictException('El pedido cambió durante el cobro');
      }
      if (await this.buscarPagoBloqueante(data.pedidoId, tx)) {
        throw new ConflictException('El pedido ya tiene un pago bloqueante');
      }

      const pago = await tx.pago.create({
        data: {
          ...datosPago,
          ...(data.estado === EstadoPago.CONFIRMADO
            ? { confirmadoEn: new Date() }
            : {}),
        },
        include: { comprobante: { select: { id: true } } },
      });

      if (data.estado !== EstadoPago.CONFIRMADO) return pago;

      const comprobante = await this.finalizarConfirmacion(
        tx,
        pago,
        data.transaccionId,
      );
      return { ...pago, comprobante };
    });
  }

  // Consultar una transacción por su identificador
  buscarPorTransaccion(transaccionId: string) {
    return this.prisma.pago.findUnique({
      where: { transaccionId },
      include: {
        pedido: {
          select: {
            tipo: true,
            sucursalId: true,
          },
        },
      },
    });
  }

  // Actualizar el estado solamente si conserva
  // el estado que se verificó anteriormente
  // Una sola transacción PostgreSQL vincula la confirmación con la emisión.
  // Si falta el ticket validado o H17 falla, se revierte el cambio de estado.
  confirmarYEmitirComprobante(transaccionId: string, estadoActual: EstadoPago) {
    return this.prisma.$transaction(async (tx) => {
      const resultado = await tx.pago.updateMany({
        where: { transaccionId, estado: estadoActual },
        data: { estado: EstadoPago.CONFIRMADO, confirmadoEn: new Date() },
      });

      if (resultado.count === 0) return resultado;

      const pago = await tx.pago.findUniqueOrThrow({
        where: { transaccionId },
      });
      await this.finalizarConfirmacion(tx, pago, transaccionId);
      return resultado;
    });
  }

  private async finalizarConfirmacion(
    tx: Prisma.TransactionClient,
    pago: {
      id: number;
      pedidoId: number;
      ticketSnapshot: Prisma.JsonValue;
      detallePago: Prisma.JsonValue;
    },
    transaccionId: string,
  ) {
    if (pago.ticketSnapshot === null) {
      throw new ConflictException(
        'No se puede confirmar el pago sin su ticket original',
      );
    }

    const pedido = await tx.pedido.findUniqueOrThrow({
      where: { id: pago.pedidoId },
      select: { tipo: true, estado: true },
    });
    if (pedido.tipo === TipoPedido.MESA) {
      const cierre = await tx.pedido.updateMany({
        where: { id: pago.pedidoId, estado: EstadoPedido.ENTREGADO },
        data: { estado: EstadoPedido.CERRADO },
      });
      if (cierre.count !== 1) {
        throw new ConflictException('El pedido de mesa debe estar entregado');
      }
    } else if (pedido.estado !== EstadoPedido.PENDIENTE_PAGO) {
      throw new ConflictException(
        'El pedido para llevar no está pendiente de pago',
      );
    }

    const comprobante = await this.comprobantesService.emitir(tx, {
      id: pago.id,
      pedidoId: pago.pedidoId,
      transaccionId,
      ticketSnapshot: pago.ticketSnapshot,
      detallePago: pago.detallePago ?? undefined,
    });
    if (
      !isDeepStrictEqual(comprobante.contenidoSnapshot, pago.ticketSnapshot) ||
      !isDeepStrictEqual(comprobante.detallePago, pago.detallePago)
    ) {
      throw new ConflictException('El comprobante no coincide con el pago');
    }
    return { id: comprobante.id };
  }

  actualizarEstado(
    transaccionId: string,
    estadoActual: EstadoPago,
    estadoNuevo: Exclude<EstadoPago, 'CONFIRMADO'>,
  ) {
    return this.prisma.pago.updateMany({
      where: {
        transaccionId,
        estado: estadoActual,
      },
      data: {
        estado: estadoNuevo,
        ...(estadoNuevo === EstadoPago.REEMBOLSADO
          ? { reembolsadoEn: new Date() }
          : {}),
      },
    });
  }

  // Recuperar los datos actualizados de una transacción
  obtenerEstado(transaccionId: string) {
    return this.prisma.pago.findUnique({
      where: { transaccionId },
      select: {
        id: true,
        pedidoId: true,
        transaccionId: true,
        monto: true,
        estado: true,
        creadoEn: true,
        actualizadoEn: true,
        confirmadoEn: true,
        reembolsadoEn: true,
        comprobante: { select: { id: true } },
        pedido: { select: { tipo: true, sucursalId: true } },
      },
    });
  }

  // Buscar un pago que impida iniciar otro cobro
  // utilizando el mismo pedido/ticket
  buscarPagoBloqueante(
    pedidoId: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    return db.pago.findFirst({
      where: {
        pedidoId,
        estado: {
          in: [
            EstadoPago.PENDIENTE,
            EstadoPago.CONFIRMADO,
            EstadoPago.REEMBOLSADO,
          ],
        },
      },
      orderBy: {
        creadoEn: 'desc',
      },
    });
  }
}
