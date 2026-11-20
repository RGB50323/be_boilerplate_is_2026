import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { isDeepStrictEqual } from 'node:util';
import { EstadoPago, EstadoPedido, TipoPedido, Prisma } from '@PrismaClient';
import { ComprobantesService } from '../../comprobantes/services/comprobantes.service.js';
import type { TicketSnapshot } from '../types/ticket-snapshot.js';
import { AcreditacionesService } from '../../lealtad/services/acreditaciones.service.js';
import { cerrarPedidoLlevarListo } from '../../pedidos/utils/cerrar-pedido-llevar.js';

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
  correoLealtad?: string;
  clienteLealtadId?: string | null;
}

//----------------------------------------------------------------------------

@Injectable()
export class PagoRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comprobantesService: ComprobantesService,
    @Inject(AcreditacionesService) private readonly acreditaciones: AcreditacionesService,
  ) {}

  validarBeneficiario(identidad: { correo: string } | { id: string }) {
    return this.acreditaciones.validarBeneficiario(identidad);
  }

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
        { actualizadoEn: Date; estado: EstadoPedido; tipo: TipoPedido }[]
      >(Prisma.sql`
        SELECT actualizado_en AS "actualizadoEn", estado::text AS estado, tipo::text AS tipo
        FROM pedido WHERE id = ${data.pedidoId} FOR NO KEY UPDATE
      `);
      const estadoCobrable =
        pedido?.tipo === TipoPedido.MESA
          ? EstadoPedido.ENTREGADO
          : EstadoPedido.PENDIENTE_PAGO;
      if (
        !pedido ||
        pedido.actualizadoEn.getTime() !== pedidoActualizadoEn.getTime() ||
        pedido.estado !== estadoCobrable
      ) {
        throw new ConflictException('El pedido cambió durante el cobro');
      }
      if (await this.buscarPagoBloqueante(data.pedidoId, tx)) {
        throw new ConflictException('El pedido ya tiene un pago bloqueante');
      }

      const confirmadoEn = data.estado === EstadoPago.CONFIRMADO
        ? await this.acreditaciones.fijarConfirmacion(tx, data.clienteLealtadId != null)
        : null;
      const pago = await tx.pago.create({
        data: {
          ...datosPago,
          confirmadoEn,
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

  buscarResolucionesSimuladas(venceEn: Date, despuesDe: number) {
    return this.prisma.pago.findMany({
      where: {
        id: { gt: despuesDe },
        metodo: 'TARJETA',
        transaccionId: { not: null },
        OR: [
          {
            estado: EstadoPago.PENDIENTE,
            creadoEn: { lte: venceEn },
            ticketSnapshot: { not: Prisma.DbNull },
          },
          {
            estado: EstadoPago.CONFIRMADO,
            pedido: {
              tipo: TipoPedido.LLEVAR,
              estado: EstadoPedido.PENDIENTE_PAGO,
            },
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: 50,
      select: { id: true, transaccionId: true, creadoEn: true, estado: true },
    });
  }

  // Consultar una transacci?n por su identificador
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
  confirmarYEmitirComprobante(
    transaccionId: string,
    estadoActual: EstadoPago,
    requiereRegla: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const confirmadoEn = await this.acreditaciones.fijarConfirmacion(tx, requiereRegla);
      const resultado = await tx.pago.updateMany({
        where: { transaccionId, estado: estadoActual },
        data: { estado: EstadoPago.CONFIRMADO, confirmadoEn },
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
      clienteLealtadId: string | null;
      confirmadoEn: Date | null;
      monto: Prisma.Decimal;
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
      select: { tipo: true, estado: true, clienteId: true },
    });
    if (pedido.tipo === TipoPedido.MESA) {
      const cierre = await tx.pedido.updateMany({
        where: { id: pago.pedidoId, estado: EstadoPedido.ENTREGADO },
        data: { estado: EstadoPedido.CERRADO },
      });
      if (cierre.count !== 1) {
        throw new ConflictException('El pedido de mesa debe estar entregado');
      }
    } else {
      // Comparte el bloqueo del pedido con cocina al resolver el último ítem.
      const [actual] = await tx.$queryRaw<
        { estado: EstadoPedido }[]
      >(Prisma.sql`
        SELECT estado::text AS estado FROM pedido
        WHERE id = ${pago.pedidoId} FOR NO KEY UPDATE
      `);
      if (
        actual?.estado !== EstadoPedido.PENDIENTE_PAGO &&
        !(await cerrarPedidoLlevarListo(tx, pago.pedidoId))
      ) {
        throw new ConflictException(
          'El pedido para llevar no está pendiente de pago ni listo para cerrar',
        );
      }
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
    // Los intentos LLEVAR anteriores a H18 ya tienen titular en el pedido.
    const beneficiario = pago.clienteLealtadId ??
      (pedido.tipo === TipoPedido.LLEVAR ? pedido.clienteId : null);
    if (beneficiario) {
      if (!pago.confirmadoEn) throw new Error('Falta la fecha de confirmación del pago.');
      await this.acreditaciones.registrarConfirmacion(
        tx, pago.id, beneficiario, pago.monto, pago.confirmadoEn,
      );
    }
    return { id: comprobante.id };
  }

  actualizarEstado(
    transaccionId: string,
    estadoActual: EstadoPago,
    estadoNuevo: Exclude<EstadoPago, 'CONFIRMADO'>,
  ) {
    const where = { transaccionId, estado: estadoActual };
    if (estadoNuevo !== EstadoPago.REEMBOLSADO) {
      return this.prisma.pago.updateMany({ where, data: { estado: estadoNuevo } });
    }

    return this.prisma.$transaction(async (tx) => {
      const reembolsadoEn = await this.acreditaciones.fijarReembolso(tx, transaccionId);
      const resultado = await tx.pago.updateMany({
        where,
        data: { estado: estadoNuevo, reembolsadoEn },
      });
      if (resultado.count === 1) {
        await this.acreditaciones.cancelarPendiente(tx, transaccionId, reembolsadoEn);
      }
      return resultado;
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

  buscarTitularPedido(id: number) {
    return this.prisma.pedido.findUnique({
      where: { id },
      select: { tipo: true, sucursalId: true, clienteId: true },
    });
  }

  buscarPagoRelevante(pedidoId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const bloqueante = await this.buscarPagoBloqueante(pedidoId, tx);
        return (
          bloqueante ??
          tx.pago.findFirst({
            where: { pedidoId, estado: EstadoPago.RECHAZADO },
            include: { comprobante: { select: { id: true } } },
            orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          })
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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
      include: { comprobante: { select: { id: true } } },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
    });
  }
}
