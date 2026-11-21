import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AlertaInsumoResponseDto } from '@Inventario/dto';
import {
  AlertaDeOtraSucursalError,
  AlertaNoEncontradaError,
  AlertaResueltaError,
} from '@Inventario/errors';
import { AlertasInsumoRepository, type AlertaRegistro } from '@Inventario/repositories';
import { deUnidadInsumo, ID_MAXIMO } from '@Inventario/utils';
import type { User } from '@PrismaClient';

const SIN_SUCURSAL = 'No tienes una sucursal asignada.';
const NO_EXISTE = 'La alerta no existe.';

function aRespuesta(alerta: AlertaRegistro): AlertaInsumoResponseDto {
  return {
    id: alerta.id,
    insumoId: alerta.insumoId,
    insumo: alerta.insumo.nombre,
    cantidad: alerta.cantidad.toNumber(),
    minimo: alerta.minimo.toNumber(),
    unidad: deUnidadInsumo(alerta.insumo.unidad),
    estado: alerta.estado,
    creadaEn: alerta.creadaEn.toISOString(),
  };
}

@Injectable()
export class AlertasService {
  constructor(private readonly alertasRepository: AlertasInsumoRepository) {}

  async listar(user: User): Promise<AlertaInsumoResponseDto[]> {
    const alertas = await this.alertasRepository.findNoResueltasBySucursal(
      this.sucursalDe(user),
    );
    return alertas.map(aRespuesta);
  }

  async marcarVista(alertaId: number, user: User): Promise<AlertaInsumoResponseDto> {
    const sucursalId = this.sucursalDe(user);
    if (alertaId > ID_MAXIMO) throw new NotFoundException(NO_EXISTE);

    try {
      return aRespuesta(await this.alertasRepository.marcarVista(alertaId, sucursalId));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  private sucursalDe(user: User): number {
    if (user.sucursalId === null) throw new ForbiddenException(SIN_SUCURSAL);
    return user.sucursalId;
  }

  private traducir(error: unknown): unknown {
    if (error instanceof AlertaNoEncontradaError) {
      return new NotFoundException(NO_EXISTE);
    }
    if (error instanceof AlertaDeOtraSucursalError) {
      return new ForbiddenException('No tienes permiso para gestionar esta alerta.');
    }
    if (error instanceof AlertaResueltaError) {
      return new ConflictException('La alerta ya está resuelta.');
    }
    return error;
  }
}
