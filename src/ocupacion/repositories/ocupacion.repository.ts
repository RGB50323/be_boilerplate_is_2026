import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

@Injectable()
export class OcupacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  sucursal(id: number, diaSemana: number) {
    return this.prisma.sucursal.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        _count: { select: { mesas: { where: { activa: true } } } },
        horarios: {
          where: { diaSemana },
          select: { apertura: true, cierre: true },
        },
      },
    });
  }

  reservaciones(sucursalId: number, inicio: Date, fin: Date) {
    return this.prisma.reservacion.findMany({
      where: {
        estado: 'CONFIRMADA',
        mesa: { sucursalId, activa: true },
        inicio: { lt: fin },
        fin: { gt: inicio },
      },
      select: { mesaId: true, inicio: true, fin: true },
    });
  }
}
