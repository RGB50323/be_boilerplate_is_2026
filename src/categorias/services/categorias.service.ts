import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { CategoriasRepository } from '../repositories/categorias.repository.js';
import { paginar, saltoDePagina } from '@Common/paginacion';

export const CATEGORIAS_POR_PAGINA = 10;

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === codigo
  );
}

@Injectable()
export class CategoriasService {
  constructor(private readonly repository: CategoriasRepository) {}

  async crear(nombre: string) {
    try {
      return await this.repository.crear(nombre);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async renombrar(id: number, nombre: string) {
    try {
      return await this.repository.renombrar(id, nombre);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async deshabilitar(id: number) {
    const categoria = await this.repository.buscarPorId(id);
    if (categoria === null) {
      throw new NotFoundException('La categoría no existe.');
    }
    if (!categoria.activa) {
      throw new ConflictException('La categoría ya está deshabilitada.');
    }
    if ((await this.repository.contarPlatillosActivos(id)) > 0) {
      throw new UnprocessableEntityException(
        'Esta categoría tiene platillos asociados. Reasígnalos antes de deshabilitarla.',
      );
    }
    return this.repository.deshabilitar(id);
  }

  async cambiarCategoriaDePlatillo(platilloId: number, categoriaId: number) {
    if ((await this.repository.buscarPlatillo(platilloId)) === null) {
      throw new NotFoundException('El platillo no existe.');
    }
    const categoria = await this.repository.buscarPorId(categoriaId);
    if (categoria === null) {
      throw new NotFoundException('La categoría no existe.');
    }
    if (!categoria.activa) {
      throw new UnprocessableEntityException(
        'La categoría está deshabilitada.',
      );
    }
    await this.repository.asignarCategoria(platilloId, categoriaId);
    return { platilloId, categoriaId };
  }

  private traducir(error: unknown): Error {
    if (esErrorPrisma(error, 'P2002')) {
      return new ConflictException('Ya existe una categoría con ese nombre.');
    }
    if (esErrorPrisma(error, 'P2025')) {
      return new NotFoundException('La categoría no existe.');
    }
    return error instanceof Error ? error : new Error('Error inesperado.');
  }

  async listar(pagina: number) {
    const { total, categorias } = await this.repository.listar(
      saltoDePagina(pagina, CATEGORIAS_POR_PAGINA),
      CATEGORIAS_POR_PAGINA,
    );
    return paginar(
      categorias.map((categoria) => ({
        id: categoria.id,
        nombre: categoria.nombre,
        activa: categoria.activa,
        deshabilitadaEn: categoria.deshabilitadaEn,
        platillosActivos: categoria._count.platillos,
      })),
      total,
      pagina,
      CATEGORIAS_POR_PAGINA,
    );
  }

  listarActivas() {
    return this.repository.listarActivas();
  }

  async listarPlatillos(categoriaId: number) {
    if ((await this.repository.buscarPorId(categoriaId)) === null) {
      throw new NotFoundException('La categoría no existe.');
    }
    return this.repository.listarPlatillosActivos(categoriaId);
  }
}
