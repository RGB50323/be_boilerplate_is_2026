import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoResena } from '@PrismaClient';

@Injectable()
export class ResenaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async platilloActivo(id: number): Promise<boolean> {
    const platillo = await this.prisma.platillo.findUnique({
      where: { id },
      select: { activo: true },
    });
    return platillo?.activo === true;
  }

  // Solo cuentan las visibles
  resumen(platilloId: number) {
    return this.prisma.resena.aggregate({
      where: { platilloId, estado: EstadoResena.VISIBLE },
      _avg: { estrellas: true },
      _count: { _all: true },
    });
  }

  distribucion(platilloId: number) {
    return this.prisma.resena.groupBy({
      by: ['estrellas'],
      where: { platilloId, estado: EstadoResena.VISIBLE },
      _count: { _all: true },
    });
  }

  findPagina(platilloId: number, skip: number, take: number) {
    return this.prisma.resena.findMany({
      where: { platilloId, estado: EstadoResena.VISIBLE },
      orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        estrellas: true,
        comentario: true,
        creadaEn: true,
        cliente: { select: { nombre: true, apellido: true } },
      },
    });
  }
}
