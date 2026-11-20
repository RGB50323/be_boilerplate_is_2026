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

  consultarVigente(tx?: Prisma.TransactionClient, instante?: Date) {
    return (tx ?? this.prisma).reglaPuntos.findFirst({
      where: instante
        ? {
            vigenteDesde: { lte: instante },
            OR: [{ activa: true }, { deshabilitadaEn: { gt: instante } }],
          }
        : { activa: true, vigenteDesde: { lte: new Date() } },
      orderBy: [{ vigenteDesde: 'desc' }, { id: 'desc' }],
      select: seleccionarRegla,
    });
  }

  async prepararConfirmacion(tx: Prisma.TransactionClient) {
    const existeActiva = await tx.reglaPuntos.findFirst({
      where: { activa: true },
      select: { id: true },
    });
    // El bloqueo compartido coordina la lectura con H20. Si falta la regla,
    // el mismo bloqueo exclusivo de H20 serializa su primera creación.
    if (existeActiva) {
      await tx.$executeRaw`LOCK TABLE regla_puntos IN SHARE MODE`;
      return this.ahora(tx);
    }

    await tx.$executeRaw`LOCK TABLE regla_puntos IN SHARE ROW EXCLUSIVE MODE`;
    const ahora = await this.ahora(tx);
    const vigente = await this.consultarVigente(tx, ahora);
    if (!vigente) {
      await tx.reglaPuntos.create({
        data: { puntosPorDolar: 1, vigenteDesde: ahora, creadaEn: ahora },
      });
    }
    return ahora;
  }

  private async ahora(tx: Prisma.TransactionClient) {
    const [fila] = await tx.$queryRaw<{ ahora: Date }[]>`
      SELECT clock_timestamp() AT TIME ZONE 'UTC' AS ahora
    `;
    return fila.ahora;
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

        const ahora = await this.ahora(tx);
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
