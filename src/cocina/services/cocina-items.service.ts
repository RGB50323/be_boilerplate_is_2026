import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ItemListoResponseDto } from '@Cocina/dto';
import {
  ItemDeOtraSucursalError,
  ItemNoEncontradoError,
  ItemNoPendienteError,
  PedidoFueraDeCocinaError,
} from '@Cocina/errors';
import { PedidoCocinaRepository } from '@Cocina/repositories';
import { EstadoItem, type User } from '@PrismaClient';
import { CocinaEventsService } from './cocina-events.service.js';

const SIN_PERMISO = 'No tienes permiso para modificar este platillo.';

const horaLocal = new Intl.DateTimeFormat('es-SV', {
  timeZone: 'America/El_Salvador',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

@Injectable()
export class CocinaItemsService {
  private readonly logger = new Logger(CocinaItemsService.name);

  constructor(
    private readonly pedidoCocinaRepository: PedidoCocinaRepository,
    private readonly cocinaEvents: CocinaEventsService,
  ) {}

  async marcarListo(itemId: number, user: User): Promise<ItemListoResponseDto> {
    if (user.sucursalId === null) throw new ForbiddenException(SIN_PERMISO);

    let marcado;
    try {
      marcado = await this.pedidoCocinaRepository.marcarItemListo(
        itemId,
        user.sucursalId,
      );
    } catch (error) {
      throw this.traducir(error);
    }

    try {
      await this.cocinaEvents.platilloListo(
        marcado.pedidoId,
        marcado.pedidoCompletado,
      );
    } catch (error) {
      this.logger.error(
        `No se pudieron publicar los eventos del ítem ${itemId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      itemId: marcado.itemId,
      estado: EstadoItem.LISTO,
      listoEn: horaLocal.format(marcado.listoEn),
      pedidoEstado: marcado.pedidoEstado,
    };
  }

  private traducir(error: unknown): unknown {
    if (error instanceof ItemNoEncontradoError) {
      return new NotFoundException('El platillo del pedido no existe.');
    }
    if (error instanceof ItemDeOtraSucursalError) {
      return new ForbiddenException(SIN_PERMISO);
    }
    if (error instanceof ItemNoPendienteError) {
      return new ConflictException('Este platillo ya está listo.');
    }
    if (error instanceof PedidoFueraDeCocinaError) {
      return new ConflictException('El pedido no está en cocina.');
    }
    return error;
  }
}
