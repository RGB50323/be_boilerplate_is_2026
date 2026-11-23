import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ItemDeOtraSucursalError, ItemNoEncontradoError } from '@Cocina/errors';
import { CocinaEventsService } from '@Cocina/services';
import { formatearHoraLocal } from '@Common/fechas';
import type { ItemEntregadoResponseDto, ItemPorEntregarDto } from '@Mesero/dto';
import {
  ItemNoListoError,
  ItemYaEntregadoError,
  PedidoCanceladoError,
} from '@Mesero/errors';
import { EntregasRepository } from '@Mesero/repositories';
import { EstadoItem, EstadoPago, EstadoPedido, type User } from '@PrismaClient';
import { esSnapshotPdf } from '../../comprobantes/services/comprobante-pdf.snapshot.js';

const SIN_PERMISO = 'No tienes permiso para entregar este platillo.';

@Injectable()
export class EntregasService {
  private readonly logger = new Logger(EntregasService.name);

  constructor(
    private readonly entregasRepository: EntregasRepository,
    private readonly cocinaEvents: CocinaEventsService,
  ) {}

  async listarPedidosPendientesDeCobro(user: User) {
    if (user.sucursalId === null) {
      throw new ForbiddenException('El usuario no tiene una sucursal asignada.');
    }

    const mesas = await this.entregasRepository.findUltimosPedidosPorMesa(
      user.sucursalId,
    );
    return mesas.flatMap(({ numero: mesa, pedidos: [pedido] }) => {
      if (!pedido) return [];
      const finalizado = pedido.pagos.some(({ estado }) =>
        estado === EstadoPago.CONFIRMADO || estado === EstadoPago.REEMBOLSADO,
      );
      const pendiente = pedido.pagos.some(({ estado }) => estado === EstadoPago.PENDIENTE);
      const comprobante = pedido.pagos.find(({ comprobante }) =>
        comprobante && esSnapshotPdf(comprobante.contenidoSnapshot),
      )?.comprobante;
      return [{
        pedidoId: pedido.id,
        numero: pedido.numero,
        mesa,
        puedeCobrar: pedido.estado === EstadoPedido.ENTREGADO && !finalizado && !pendiente,
        pagoBloqueante: !finalizado && pendiente ? EstadoPago.PENDIENTE : null,
        comprobanteId: comprobante?.id ?? null,
      }];
    });
  }

  async listarItemsListos(user: User): Promise<ItemPorEntregarDto[]> {
    if (user.sucursalId === null) {
      throw new ForbiddenException('El usuario no tiene una sucursal asignada.');
    }

    const items = await this.entregasRepository.findItemsListos(user.sucursalId);
    return items.map((item) => ({
      itemId: item.id,
      pedidoId: item.pedidoId,
      mesa: item.pedido.mesa?.numero ?? null,
      platillo: item.platillo.nombre,
      cantidad: item.cantidad,
      listoEn: item.listoEn ? formatearHoraLocal(item.listoEn) : null,
    }));
  }

  async marcarEntregado(itemId: number, user: User): Promise<ItemEntregadoResponseDto> {
    if (user.sucursalId === null) throw new ForbiddenException(SIN_PERMISO);

    let marcado;
    try {
      marcado = await this.entregasRepository.marcarItemEntregado(
        itemId,
        user.sucursalId,
        user.id,
      );
    } catch (error) {
      throw this.traducir(error);
    }

    if (marcado.pedidoCompletado) {
      try {
        await this.cocinaEvents.pedidoEntregado(marcado.pedidoId);
      } catch (error) {
        this.logger.error(
          `No se pudo publicar la entrega del pedido ${marcado.pedidoId}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return {
      itemId: marcado.itemId,
      estado: EstadoItem.ENTREGADO,
      entregadoEn: formatearHoraLocal(marcado.entregadoEn),
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
    if (error instanceof ItemYaEntregadoError) {
      return new ConflictException('Este platillo ya fue entregado.');
    }
    if (error instanceof PedidoCanceladoError) {
      return new ConflictException('El pedido está cancelado.');
    }
    if (error instanceof ItemNoListoError) {
      return new UnprocessableEntityException('Este platillo todavía no está listo.');
    }
    return error;
  }
}
