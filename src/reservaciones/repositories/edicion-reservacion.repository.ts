import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';

const detalle = {
  mesa: { include: { sucursal: { include: { horarios: true } } } },
} as const;
export type ReservaEditable = Prisma.ReservacionGetPayload<{
  include: typeof detalle;
}>;

export class MesaNoDisponibleError extends Error {}

@Injectable()
export class EdicionReservacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  buscar(id: number, clienteId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).reservacion.findFirst({
      where: { id, clienteId },
      include: detalle,
    });
  }

  editar<T>(
    id: number,
    clienteId: string,
    operacion: (
      reserva: ReservaEditable | null,
      tx: Prisma.TransactionClient,
    ) => Promise<T>,
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM reservacion WHERE id = ${id} AND cliente_id = ${clienteId}::uuid FOR UPDATE`,
        );
        return operacion(await this.buscar(id, clienteId, tx), tx);
      })
      .catch((error: unknown) => {
        // Traducimos después del rollback: una violación de exclusión deja la
        // transacción abortada y no se puede continuar devolviendo null desde guardar.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2010' &&
          (error.meta?.code === '23P01' ||
            (
              error.meta?.driverAdapterError as
                { cause?: { originalCode?: string } } | undefined
            )?.cause?.originalCode === '23P01')
        ) {
          throw new MesaNoDisponibleError('La mesa no está disponible.');
        }
        throw error;
      });
  }

  cancelar(id: number, modificadaEn: Date, tx: Prisma.TransactionClient) {
    return tx.reservacion.update({
      where: { id },
      data: { estado: 'CANCELADA', modificadaEn, canceladaEn: new Date() },
      include: detalle,
    });
  }

  mesa(id: number, tx: Prisma.TransactionClient) {
    return tx.mesa.findUnique({
      where: { id },
    });
  }

  async guardar(
    id: number,
    datos: {
      mesaId: number;
      personas: number;
      inicio: Date;
      fin: Date;
      modificadaEn: Date;
    },
    tx: Prisma.TransactionClient,
  ) {
    // El UPDATE participa en la misma exclusión de intervalos que la creación de H10.
    await tx.$executeRaw(Prisma.sql`UPDATE reservacion SET mesa_id = ${datos.mesaId}, personas = ${datos.personas},
      inicio = ${datos.inicio.toISOString().slice(0, 23)}::timestamp, fin = ${datos.fin.toISOString().slice(0, 23)}::timestamp,
      modificada_en = ${datos.modificadaEn.toISOString().slice(0, 23)}::timestamp,
      recordatorio_enviado_en = CASE WHEN inicio <> ${datos.inicio.toISOString().slice(0, 23)}::timestamp THEN NULL ELSE recordatorio_enviado_en END
      WHERE id = ${id}`);
    return tx.reservacion.findUniqueOrThrow({
      where: { id },
      include: detalle,
    });
  }
}
