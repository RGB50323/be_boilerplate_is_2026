import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

const CATEGORIA_PUBLICA = { id: true, nombre: true, activa: true } as const;

@Injectable()
export class CategoriasRepository {
  constructor(private readonly prisma: PrismaService) {}

  crear(nombre: string) {
    return this.prisma.categoria.create({
      data: { nombre },
      select: CATEGORIA_PUBLICA,
    });
  }

  renombrar(id: number, nombre: string) {
    return this.prisma.categoria.update({
      where: { id },
      data: { nombre },
      select: CATEGORIA_PUBLICA,
    });
  }

  buscarPorId(id: number) {
    return this.prisma.categoria.findUnique({
      where: { id },
      select: { id: true, activa: true },
    });
  }

  contarPlatillosActivos(categoriaId: number) {
    return this.prisma.platillo.count({
      where: { categoriaId, activo: true },
    });
  }

  deshabilitar(id: number) {
    return this.prisma.categoria.update({
      where: { id },
      data: { activa: false, deshabilitadaEn: new Date() },
      select: { id: true, activa: true, deshabilitadaEn: true },
    });
  }

  buscarPlatillo(id: number) {
    return this.prisma.platillo.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  asignarCategoria(platilloId: number, categoriaId: number) {
    return this.prisma.platillo.update({
      where: { id: platilloId },
      data: { categoriaId },
      select: { id: true, categoriaId: true },
    });
  }

  listar() {
    return this.prisma.categoria.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        activa: true,
        deshabilitadaEn: true,
        _count: { select: { platillos: { where: { activo: true } } } },
      },
    });
  }

  listarPlatillosActivos(categoriaId: number) {
    return this.prisma.platillo.findMany({
      where: { categoriaId, activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    });
  }
}
