import { Injectable } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

const seleccion = (sucursalId: number) =>
  ({
    id: true,
    nombre: true,
    descripcion: true,
    imagenUrl: true,
    categoriaId: true,
    categoria: { select: { nombre: true } },
    sucursales: {
      where: { sucursalId },
      select: {
        precio: true,
        disponibilidad: true,
        activo: true,
      },
    },
  }) satisfies Prisma.PlatilloSelect;

export type PlatilloRegistro = Prisma.PlatilloGetPayload<{
  select: ReturnType<typeof seleccion>;
}>;

export type DatosPlatillo = {
  nombre: string;
  descripcion?: string;
  precio: number;
  categoriaId: number;
  disponibilidad: number;
  imagenUrl?: string;
};

@Injectable()
export class PlatillosRepository {
  constructor(private readonly prisma: PrismaService) {}

  crear(sucursalId: number, datos: DatosPlatillo) {
    return this.prisma.platillo.create({
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        imagenUrl: datos.imagenUrl,
        categoriaId: datos.categoriaId,
        sucursales: {
          create: {
            sucursalId,
            precio: datos.precio,
            disponibilidad: datos.disponibilidad,
          },
        },
      },
      select: seleccion(sucursalId),
    });
  }

  editar(id: number, sucursalId: number, datos: DatosPlatillo) {
    return this.prisma.platillo.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        imagenUrl: datos.imagenUrl,
        categoriaId: datos.categoriaId,
        sucursales: {
          update: {
            where: { platilloId_sucursalId: { platilloId: id, sucursalId } },
            data: {
              precio: datos.precio,
              disponibilidad: datos.disponibilidad,
            },
          },
        },
      },
      select: seleccion(sucursalId),
    });
  }

  async listar(
    sucursalId: number,
    q: string | undefined,
    soloActivos: boolean,
    skip: number,
    take: number,
  ) {
    const where: Prisma.PlatilloWhereInput = {
      sucursales: {
        some: {
          sucursalId,
          activo: soloActivos ? true : undefined,
        },
      },
      nombre: q ? { contains: q, mode: 'insensitive' } : undefined,
    };
    const [total, platillos] = await this.prisma.$transaction([
      this.prisma.platillo.count({ where }),
      this.prisma.platillo.findMany({
        where,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: seleccion(sucursalId),
      }),
    ]);
    return { total, platillos };
  }

  async buscarPropio(id: number, sucursalId: number) {
    const platillo = await this.prisma.platillo.findUnique({
      where: { id },
      select: {
        id: true,
        categoriaId: true,
        sucursales: {
          where: { sucursalId },
          select: { id: true, activo: true },
        },
      },
    });

    if (!platillo) return null;

    return {
      ...platillo,
      activo: platillo.sucursales[0]?.activo ?? false,
    };
  }

  buscarCategoria(id: number) {
    return this.prisma.categoria.findUnique({
      where: { id },
      select: { id: true, activa: true },
    });
  }

  async deshabilitar(id: number, sucursalId: number) {
    const resultado = await this.prisma.platilloSucursal.update({
      where: {
        platilloId_sucursalId: {
          platilloId: id,
          sucursalId,
        },
      },
      data: { activo: false },
      select: { platilloId: true, activo: true },
    });

    return {
      id: resultado.platilloId,
      activo: resultado.activo,
    };
  }

  async habilitar(id: number, sucursalId: number) {
    const resultado = await this.prisma.platilloSucursal.update({
      where: {
        platilloId_sucursalId: {
          platilloId: id,
          sucursalId,
        },
      },
      data: { activo: true },
      select: { platilloId: true, activo: true },
    });

    return {
      id: resultado.platilloId,
      activo: resultado.activo,
    };
  }

  buscarDetalle(id: number, sucursalId: number) {
    return this.prisma.platillo.findFirst({
      where: { id, sucursales: { some: { sucursalId } } },
      select: seleccion(sucursalId),
    });
  }
}
