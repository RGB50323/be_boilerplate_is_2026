import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { formatearFechaLocal, formatearHoraLocal } from '@Common/fechas';
import { paginar, saltoDePagina } from '@Common/paginacion';
import type {
  CrearInsumoDto,
  HistorialMovimientosResponseDto,
  InsumoResponseDto,
  MovimientoRegistradoResponseDto,
  RegistrarMovimientoDto,
} from '@Inventario/dto';
import {
  CantidadMaximaExcedidaError,
  ExistenciaInsuficienteError,
  InsumoDeOtraSucursalError,
  InsumoDuplicadoError,
  InsumoNoEncontradoError,
} from '@Inventario/errors';
import { InsumosRepository, type InsumoRegistro } from '@Inventario/repositories';
import {
  aUnidadInsumo,
  deUnidadInsumo,
  estadoDeInsumo,
  ID_MAXIMO,
} from '@Inventario/utils';
import type { User } from '@PrismaClient';
import { EvaluadorAlertasInventario } from './evaluador-alertas-inventario.service.js';

export const MOVIMIENTOS_POR_PAGINA = 10;

const SIN_SUCURSAL = 'No tienes una sucursal asignada.';
const SIN_PERMISO = 'No tienes permiso para gestionar este insumo.';
const NO_EXISTE = 'El insumo no existe.';

function aRespuesta(insumo: InsumoRegistro): InsumoResponseDto {
  return {
    id: insumo.id,
    nombre: insumo.nombre,
    unidad: deUnidadInsumo(insumo.unidad),
    cantidad: insumo.cantidad.toNumber(),
    minimo: insumo.minimo.toNumber(),
    estado: estadoDeInsumo(insumo.cantidad, insumo.minimo),
  };
}

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(
    private readonly insumosRepository: InsumosRepository,
    private readonly evaluadorAlertas: EvaluadorAlertasInventario,
  ) {}

  async listar(user: User, q?: string): Promise<InsumoResponseDto[]> {
    const insumos = await this.insumosRepository.findBySucursal(
      this.sucursalDe(user),
      q || undefined,
    );
    return insumos.map(aRespuesta);
  }

  async crear(user: User, dto: CrearInsumoDto): Promise<InsumoResponseDto> {
    const sucursalId = this.sucursalDe(user);
    try {
      const insumo = await this.insumosRepository.crear(sucursalId, {
        nombre: dto.nombre,
        unidad: aUnidadInsumo(dto.unidad),
        minimo: dto.minimo,
      });
      return aRespuesta(insumo);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async registrarMovimiento(
    insumoId: number,
    user: User,
    dto: RegistrarMovimientoDto,
  ): Promise<MovimientoRegistradoResponseDto> {
    const sucursalId = this.sucursalDe(user);
    if (insumoId > ID_MAXIMO) throw new NotFoundException(NO_EXISTE);

    let registrado;
    try {
      registrado = await this.insumosRepository.registrarMovimiento(
        insumoId,
        sucursalId,
        user.id,
        { tipo: dto.tipo, cantidad: dto.cantidad, motivo: dto.motivo },
      );
    } catch (error) {
      throw this.traducir(error);
    }

    try {
      await this.evaluadorAlertas.evaluar(insumoId);
    } catch (error) {
      this.logger.error(
        `No se pudo evaluar la alerta del insumo ${insumoId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      movimientoId: registrado.movimientoId,
      cantidadAnterior: registrado.cantidadAnterior.toNumber(),
      cantidadActual: registrado.cantidadActual.toNumber(),
    };
  }

  async historial(
    insumoId: number,
    user: User,
    pagina: number,
  ): Promise<HistorialMovimientosResponseDto> {
    const sucursalId = this.sucursalDe(user);
    if (insumoId > ID_MAXIMO) throw new NotFoundException(NO_EXISTE);

    const insumo = await this.insumosRepository.findSucursalDeInsumo(insumoId);
    if (!insumo) throw new NotFoundException(NO_EXISTE);
    if (insumo.sucursalId !== sucursalId) throw new ForbiddenException(SIN_PERMISO);

    const { total, movimientos } = await this.insumosRepository.findMovimientos(
      insumoId,
      saltoDePagina(pagina, MOVIMIENTOS_POR_PAGINA),
      MOVIMIENTOS_POR_PAGINA,
    );
    return paginar(
      movimientos.map((m) => ({
        id: m.id,
        fecha: formatearFechaLocal(m.creadoEn),
        hora: formatearHoraLocal(m.creadoEn),
        usuario: m.usuario
          ? [m.usuario.nombre, m.usuario.apellido].filter(Boolean).join(' ') ||
            m.usuario.email
          : null,
        tipo: m.tipo,
        cantidad: m.cantidad.toNumber(),
        motivo: m.motivo,
      })),
      total,
      pagina,
      MOVIMIENTOS_POR_PAGINA,
    );
  }

  private sucursalDe(user: User): number {
    if (user.sucursalId === null) throw new ForbiddenException(SIN_SUCURSAL);
    return user.sucursalId;
  }

  private traducir(error: unknown): unknown {
    if (error instanceof InsumoDuplicadoError) {
      return new ConflictException('Ya existe un insumo con ese nombre en la sucursal.');
    }
    if (error instanceof InsumoNoEncontradoError) {
      return new NotFoundException(NO_EXISTE);
    }
    if (error instanceof InsumoDeOtraSucursalError) {
      return new ForbiddenException(SIN_PERMISO);
    }
    if (error instanceof ExistenciaInsuficienteError) {
      return new UnprocessableEntityException(
        'La salida supera la existencia del insumo.',
      );
    }
    if (error instanceof CantidadMaximaExcedidaError) {
      return new UnprocessableEntityException(
        'La entrada supera la cantidad máxima permitida.',
      );
    }
    return error;
  }
}
