import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

@Injectable()
export class ComprobantesRepository {
  @Inject(PrismaService)
  private readonly prisma!: PrismaService;

  buscarPorId(id: number) {
    return this.prisma.comprobante.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        ticketId: true,
        transaccionId: true,
        fechaEmision: true,
        contenidoSnapshot: true,
        detallePago: true,
        primeraGeneracionPdfEn: true,
        pedido: {
          select: {
            clienteId: true,
            sucursalId: true,
            tipo: true,
          },
        },
      },
    });
  }

  // PostgreSQL comprueba y actualiza la marca en una sola operación.
  // La solicitud que actualiza la fila entrega el ORIGINAL. Las demás dan COPIA.
  reclamarPrimeraGeneracionPdf(id: number) {
    return this.prisma.comprobante.updateMany({
      where: { id, primeraGeneracionPdfEn: null },
      data: { primeraGeneracionPdfEn: new Date() },
    });
  }

  crear(
    tx: Prisma.TransactionClient,
    data: Prisma.ComprobanteUncheckedCreateInput,
  ) {
    return tx.comprobante.create({ data });
  }
}
