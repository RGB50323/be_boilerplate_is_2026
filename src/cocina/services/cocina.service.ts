import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ESTADOS_EN_COCINA } from '@Cocina/constants';
import { PedidoCocinaDto } from '@Cocina/dto';
import { PedidoCocinaRepository, type PedidoCocina } from '@Cocina/repositories';
import { EstadoItem, type User } from '@PrismaClient';
import type { EnvConfig } from '@Config';

/** Reglas de la cola de cocina: qué pedidos se ven y cómo se presentan. */
@Injectable()
export class CocinaService {
  private readonly minutosRetraso: number;

  constructor(
    private readonly pedidoCocinaRepository: PedidoCocinaRepository,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.minutosRetraso = configService.get('COCINA_MINUTOS_RETRASO', {
      infer: true,
    });
  }

  /**
   * Pedidos pendientes de la sucursal del usuario, en orden de llegada.
   *
   * La sucursal sale siempre del usuario autenticado y nunca del request, así
   * nadie puede pedir la cola de otra sucursal.
   *
   * @throws {ForbiddenException} si el usuario no tiene sucursal asignada.
   */
  async listarPendientes(user: User): Promise<PedidoCocinaDto[]> {
    if (user.sucursalId === null) {
      throw new ForbiddenException('El usuario no tiene una sucursal asignada.');
    }

    const pedidos = await this.pedidoCocinaRepository.findPendientesBySucursal(
      user.sucursalId,
    );
    const ahora = new Date();
    return pedidos.map((pedido) => this.toDto(pedido, ahora));
  }

  /**
   * Misma regla que PedidoCocinaRepository.findPendientesBySucursal, aplicada
   * a un pedido ya cargado.
   */
  esVisibleEnCocina(pedido: PedidoCocina): boolean {
    return (
      ESTADOS_EN_COCINA.includes(pedido.estado) &&
      pedido.detalles.some((detalle) => detalle.estado === EstadoItem.PENDIENTE)
    );
  }

  toDto(pedido: PedidoCocina, ahora: Date = new Date()): PedidoCocinaDto {
    return PedidoCocinaDto.fromEntity(pedido, this.minutosRetraso, ahora);
  }
}
