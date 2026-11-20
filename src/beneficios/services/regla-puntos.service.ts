import { Inject, Injectable } from '@nestjs/common';
import { AccionLealtad, EntidadLealtad, Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

const seleccionarRegla = {
  id: true,
  puntosPorDolar: true,
  vigenteDesde: true,
} satisfies Prisma.ReglaPuntosSelect;

@Injectable()
export class ReglaPuntosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  consultarVigente() {
    return this.prisma.reglaPuntos.findFirst({
      where: { activa: true, vigenteDesde: { lte: new Date() } },
      select: seleccionarRegla,
    });
  }

  confirmar(puntosPorDolar: number, usuarioId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        // También serializa la creación inicial, cuando aún no hay filas.
        await tx.$executeRaw`LOCK TABLE regla_puntos IN SHARE ROW EXCLUSIVE MODE`;
        const anterior = await tx.reglaPuntos.findFirst({
          where: { activa: true },
          select: seleccionarRegla,
        });
        if (anterior?.puntosPorDolar === puntosPorDolar) return anterior;

        const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`
          SELECT clock_timestamp() AS ahora
        `;
        if (anterior) {
          await tx.reglaPuntos.update({
            where: { id: anterior.id },
            data: {
              activa: false,
              modificadaEn: ahora,
              deshabilitadaEn: ahora,
            },
          });
        }

        const nueva = await tx.reglaPuntos.create({
          data: { puntosPorDolar, vigenteDesde: ahora, creadaEn: ahora },
          select: seleccionarRegla,
        });
        await tx.historialLealtad.create({
          data: {
            entidad: EntidadLealtad.REGLA,
            entidadId: nueva.id,
            accion: anterior
              ? AccionLealtad.MODIFICACION
              : AccionLealtad.CREACION,
            usuarioId,
            fecha: ahora,
            valorAnterior: anterior
              ? { id: anterior.id, puntosPorDolar: anterior.puntosPorDolar }
              : Prisma.DbNull,
            valorNuevo: { id: nueva.id, puntosPorDolar: nueva.puntosPorDolar },
          },
        });
        return nueva;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
