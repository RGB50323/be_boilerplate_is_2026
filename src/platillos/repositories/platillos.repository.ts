import { Injectable } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

const seleccion = (sucursalId: number) =>
  ({
    id: true,
    nombre: true,
    descripcion: true,
    imagenUrl: true,
    activo: true,
    categoriaId: true,
    categoria: { select: { nombre: true } },
    sucursales: {
      where: { sucursalId },
      select: { precio: true, disponibilidad: true },
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

  listar(sucursalId: number) {
    return this.prisma.platillo.findMany({
      where: { sucursales: { some: { sucursalId } } },
      orderBy: { nombre: 'asc' },
      select: seleccion(sucursalId),
    });
  }

  buscarPropio(id: number, sucursalId: number) {
    return this.prisma.platillo.findUnique({
      where: { id },
      select: {
        id: true,
        activo: true,
        categoriaId: true,
        sucursales: { where: { sucursalId }, select: { id: true } },
      },
    });
  }

  buscarCategoria(id: number) {
    return this.prisma.categoria.findUnique({
      where: { id },
      select: { id: true, activa: true },
    });
  }

  deshabilitar(id: number) {
    return this.prisma.platillo.update({
      where: { id },
      data: { activo: false },
      select: { id: true, activo: true },
    });
  }
}