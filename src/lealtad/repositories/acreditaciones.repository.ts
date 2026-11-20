import { Inject, Injectable } from '@nestjs/common';
import {
  EstadoAcreditacionPuntos,
  Prisma,
  TipoMovimientoPuntos,
} from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

const pendiente = EstadoAcreditacionPuntos.PENDIENTE;

@Injectable()
export class AcreditacionesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async asegurarCuenta(tx: Prisma.TransactionClient, clienteId: string) {
    await tx.cuentaPuntos.createMany({
      data: { clienteId },
      skipDuplicates: true,
    });
    return tx.cuentaPuntos.findUniqueOrThrow({
      where: { clienteId },
      select: { id: true },
    });
  }

  crear(
    tx: Prisma.TransactionClient,
    data: Prisma.AcreditacionPuntosUncheckedCreateInput,
  ) {
    return tx.acreditacionPuntos.create({ data });
  }

  async fijarReembolso(tx: Prisma.TransactionClient, transaccionId: string) {
    // La liberación también escribe esta fila. El instante de reembolso se
    // toma una vez resuelta la contención, antes de actualizar pago y puntos.
    await tx.$queryRaw`
      SELECT a.id FROM acreditacion_puntos AS a
      JOIN pago AS p ON p.id = a.pago_id
      WHERE p.transaccion_id = ${transaccionId}
      FOR UPDATE OF a
    `;
    return this.ahora(tx);
  }

  cancelarPendiente(
    tx: Prisma.TransactionClient,
    transaccionId: string,
    fecha: Date,
  ) {
    return tx.acreditacionPuntos.updateMany({
      where: {
        pago: { transaccionId },
        estado: pendiente,
        liberableEn: { gt: fecha },
      },
      data: {
        estado: EstadoAcreditacionPuntos.CANCELADA,
        puntos: 0,
        canceladaEn: fecha,
      },
    });
  }

  listarLiberables(ahora: Date, despuesDe: number, limite: number) {
    return this.prisma.acreditacionPuntos.findMany({
      where: {
        id: { gt: despuesDe },
        estado: pendiente,
        liberableEn: { lte: ahora },
      },
      orderBy: { id: 'asc' },
      take: limite,
      select: { id: true },
    });
  }

  liberar(id: number, ahora: Date) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.acreditacionPuntos.updateMany({
        where: {
          id,
          estado: pendiente,
          liberableEn: { lte: ahora },
        },
        data: { estado: EstadoAcreditacionPuntos.LIBERADA, liberadaEn: ahora },
      });
      if (count === 0) return false;

      const acreditacion = await tx.acreditacionPuntos.findUniqueOrThrow({
        where: { id },
        include: { pago: { select: { pedidoId: true } } },
      });
      const { puntos, cuentaPuntosId, reglaId, puntosPorDolar } = acreditacion;
      if (puntos === 0) return true;

      const { saldo } = await tx.cuentaPuntos.update({
        where: { id: cuentaPuntosId },
        data: { saldo: { increment: puntos } },
        select: { saldo: true },
      });
      await tx.movimientoPuntos.create({
        data: {
          tipo: TipoMovimientoPuntos.ACUMULACION,
          cuentaPuntosId,
          puntos,
          saldoAnterior: saldo - puntos,
          saldoResultante: saldo,
          reglaId,
          puntosPorDolar,
          pedidoId: acreditacion.pago.pedidoId,
          fecha: ahora,
        },
      });
      return true;
    });
  }

  async ahora(tx: Prisma.TransactionClient = this.prisma) {
    // Las columnas de Prisma son timestamp sin zona. El driver recibe UTC
    // explícito, independiente de la zona de sesión de PostgreSQL.
    const [fila] = await tx.$queryRaw<{ ahora: Date }[]>`
      SELECT clock_timestamp() AT TIME ZONE 'UTC' AS ahora
    `;
    return fila.ahora;
  }
}
