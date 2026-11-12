import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoPago } from '@PrismaClient';

interface CrearPagoData {
  pedidoId: number;
  idempotencyKey: string;
  transaccionId: string;
  monto: number;
  estado: EstadoPago;
}

@Injectable()
export class PagoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Buscar una operación previamente registrada
  buscarPorSolicitud(idempotencyKey: string) {
    return this.prisma.pago.findUnique({
      where: { idempotencyKey },
    });
  }

  // Verificar que el pedido existe
  buscarPedido(pedidoId: number) {
    return this.prisma.pedido.findUnique({
      where: { id: pedidoId },
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

  // Consultar una transacción por su referencia
  buscarPorTransaccion(transaccionId: string) {
    return this.prisma.pago.findUnique({
      where: { transaccionId },
    });
  }
}
