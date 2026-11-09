import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

export type FiltrosMenu = {
  categoriaId?: number;
  precioMin?: number;
  precioMax?: number;
};

@Injectable()
export class MenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sucursalExiste(id: number): Promise<boolean> {
    return (await this.prisma.sucursal.count({ where: { id } })) > 0;
  }

  findVisibles(sucursalId: number, filtros: FiltrosMenu) {
    return this.prisma.platilloSucursal.findMany({
      where: {
        sucursalId,
        disponibilidad: { gt: 0 },
        precio: { gte: filtros.precioMin, lte: filtros.precioMax },
        platillo: {
          activo: true,
          categoriaId: filtros.categoriaId,
          categoria: { activa: true },
        },
      },
      select: {
        precio: true,
        disponibilidad: true,
        platillo: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            imagenUrl: true,
            categoria: { select: { id: true, nombre: true } },
          },
        },
      },
    });
  }
}