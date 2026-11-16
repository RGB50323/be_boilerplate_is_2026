import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ESTADOS_EN_COCINA } from '@Cocina/constants';
import { PedidoCocinaDto } from '@Cocina/dto';
import { PedidoCocinaRepository, type PedidoCocina } from '@Cocina/repositories';
import { EstadoItem, EstadoPago, TipoPedido, type User } from '@PrismaClient';
import type { EnvConfig } from '@Config';

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

  esVisibleEnCocina(pedido: PedidoCocina): boolean {
    return (
      ESTADOS_EN_COCINA.includes(pedido.estado) &&
      pedido.detalles.some((detalle) => detalle.estado === EstadoItem.PENDIENTE) &&
      (pedido.tipo === TipoPedido.MESA ||
        pedido.pagos.some((pago) => pago.estado === EstadoPago.CONFIRMADO))
    );
  }

  toDto(pedido: PedidoCocina, ahora: Date = new Date()): PedidoCocinaDto {
    return PedidoCocinaDto.fromEntity(pedido, this.minutosRetraso, ahora);
  }
}
