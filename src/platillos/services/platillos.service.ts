import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Rol, type User } from '@PrismaClient';
import type { GuardarPlatilloDto, PlatilloResponseDto } from '../dto/index.js';
import {
  PlatillosRepository,
  type PlatilloRegistro,
} from '../repositories/platillos.repository.js';
import { paginar, saltoDePagina } from '@Common/paginacion';
import type { ListarPlatillosQueryDto } from '../dto/listar-platillos-query.dto.js';
import type { PlatillosPaginadosResponseDto } from '../dto/platillos-paginados-response.dto.js';

const SIN_PERMISO_SUCURSAL = 'No tienes permiso para gestionar esta sucursal.';
export const PLATILLOS_POR_PAGINA = 10;

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === codigo
  );
}

function aRespuesta(platillo: PlatilloRegistro): PlatilloResponseDto {
  const enSucursal = platillo.sucursales[0];
  return {
    id: platillo.id,
    nombre: platillo.nombre,
    descripcion: platillo.descripcion,
    imagenUrl: platillo.imagenUrl,
    categoriaId: platillo.categoriaId,
    categoriaNombre: platillo.categoria.nombre,
    precio: enSucursal?.precio.toNumber() ?? 0,
    disponibilidad: enSucursal?.disponibilidad ?? 0,
    activo: platillo.activo,
  };
}

@Injectable()
export class PlatillosService {
  constructor(private readonly repository: PlatillosRepository) {}

  async listar(
    sucursalId: number,
    usuario: User,
    query: ListarPlatillosQueryDto,
  ): Promise<PlatillosPaginadosResponseDto> {
    this.verificarSucursal(sucursalId, usuario.sucursalId);
    const { total, platillos } = await this.repository.listar(
      sucursalId,
      query.q,
      usuario.rol === Rol.MESERO,
      saltoDePagina(query.pagina, PLATILLOS_POR_PAGINA),
      PLATILLOS_POR_PAGINA,
    );
    return paginar(
      platillos.map(aRespuesta),
      total,
      query.pagina,
      PLATILLOS_POR_PAGINA,
    );
  }

  async crear(
    sucursalId: number,
    dto: GuardarPlatilloDto,
    sucursalGerente: number | null,
  ): Promise<PlatilloResponseDto> {
    this.verificarSucursal(sucursalId, sucursalGerente);
    await this.verificarCategoria(dto.categoriaId, true);
    try {
      return aRespuesta(await this.repository.crear(sucursalId, dto));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async editar(
    id: number,
    dto: GuardarPlatilloDto,
    sucursalGerente: number | null,
  ): Promise<PlatilloResponseDto> {
    const platillo = await this.obtenerPropio(id, sucursalGerente);
    await this.verificarCategoria(
      dto.categoriaId,
      dto.categoriaId !== platillo.categoriaId,
    );
    try {
      return aRespuesta(
        await this.repository.editar(id, sucursalGerente as number, dto),
      );
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async deshabilitar(id: number, sucursalGerente: number | null) {
    const platillo = await this.obtenerPropio(id, sucursalGerente);
    if (!platillo.activo) {
      throw new ConflictException('El platillo ya está deshabilitado.');
    }
    return this.repository.deshabilitar(id);
  }

  async habilitar(id: number, sucursalGerente: number | null) {
    const platillo = await this.obtenerPropio(id, sucursalGerente);
    if (platillo.activo) {
      throw new ConflictException('El platillo ya está habilitado.');
    }
    await this.verificarCategoria(platillo.categoriaId, true);
    return this.repository.habilitar(id);
  }

    async obtener(
    id: number,
    sucursalId: number | null,
  ): Promise<PlatilloResponseDto> {
    if (sucursalId === null) {
      throw new ForbiddenException('No tienes una sucursal asignada.');
    }
    const platillo = await this.repository.buscarDetalle(id, sucursalId);
    if (!platillo) throw new NotFoundException('El platillo no existe.');
    return aRespuesta(platillo);
  }

  private verificarSucursal(
    sucursalId: number,
    sucursalGerente: number | null,
  ): void {
    if (sucursalGerente !== sucursalId) {
      throw new ForbiddenException(SIN_PERMISO_SUCURSAL);
    }
  }

  private async obtenerPropio(id: number, sucursalGerente: number | null) {
    if (sucursalGerente === null) {
      throw new ForbiddenException(SIN_PERMISO_SUCURSAL);
    }
    const platillo = await this.repository.buscarPropio(id, sucursalGerente);
    if (platillo === null) {
      throw new NotFoundException('El platillo no existe.');
    }
    if (platillo.sucursales.length === 0) {
      throw new ForbiddenException(SIN_PERMISO_SUCURSAL);
    }
    return platillo;
  }

  private async verificarCategoria(id: number, exigirActiva: boolean) {
    const categoria = await this.repository.buscarCategoria(id);
    if (categoria === null) {
      throw new NotFoundException('La categoría no existe.');
    }
    if (exigirActiva && !categoria.activa) {
      throw new UnprocessableEntityException(
        'La categoría está deshabilitada.',
      );
    }
  }

  private traducir(error: unknown): unknown {
    if (esErrorPrisma(error, 'P2002')) {
      return new ConflictException('Ya existe un platillo con ese nombre.');
    }
    if (esErrorPrisma(error, 'P2025')) {
      return new NotFoundException('El platillo no existe.');
    }
    return error;
  }
}
