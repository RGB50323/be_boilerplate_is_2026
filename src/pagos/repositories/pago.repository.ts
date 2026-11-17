
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoPago } from '@PrismaClient';

//----------------------------------------------------------------------------

interface CrearPagoData {
  pedidoId: number;
  idempotencyKey: string;
  transaccionId: string;
  monto: number;
  estado: EstadoPago;
}

//----------------------------------------------------------------------------

@Injectable()
export class PagoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Buscar una operación previamente registrada
  buscarPorSolicitud(idempotencyKey: string) {
    return this.prisma.pago.findUnique({
      where: { idempotencyKey },
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
    return this.prisma.pago.create({
      data: {
        pedidoId: data.pedidoId,
        idempotencyKey: data.idempotencyKey,
        transaccionId: data.transaccionId,
        monto: data.monto,
        estado: data.estado,
      },
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
        },
      },
    },
  });
}

  // Actualizar el estado solamente si conserva
  // el estado que se verificó anteriormente
  actualizarEstado(
    transaccionId: string,
    estadoActual: EstadoPago,
    estadoNuevo: EstadoPago,
  ) {
    return this.prisma.pago.updateMany({
      where: {
        transaccionId,
        estado: estadoActual,
      },
      data: {
        estado: estadoNuevo,
        ...(estadoNuevo === EstadoPago.CONFIRMADO
          ? { confirmadoEn: new Date() }
          : {}),
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
      },
    });
  }

  // Buscar un pago que impida iniciar otro cobro
  // utilizando el mismo pedido/ticket
  buscarPagoBloqueante(pedidoId: number) {
    return this.prisma.pago.findFirst({
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
