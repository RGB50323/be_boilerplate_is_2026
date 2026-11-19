import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CocinaEvento, type PedidoCocinaEvento } from '@Cocina/events';
import { NotificacionesService } from '@Notificaciones/services';
import { EstadoPedido, ModuloOrigen, TipoPedido } from '@PrismaClient';
import { PedidosLlevarRepository } from '../repositories/pedidos-llevar.repository.js';

// H25: avisa al cliente cuando cocina termina su pedido para llevar
@Injectable()
export class AvisoPedidoListoService {
  private readonly logger = new Logger(AvisoPedidoListoService.name);

  constructor(
    private readonly repository: PedidosLlevarRepository,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @OnEvent(CocinaEvento.PEDIDO_LISTO, { async: true })
  async alListo({ pedido }: PedidoCocinaEvento): Promise<void> {
    try {
      await this.avisar(pedido.id);
    } catch (error) {
      // El aviso no debe afectar a cocina
      this.logger.error(
        `No se pudo avisar que el pedido ${pedido.id} está listo`,
        error,
      );
    }
  }

  async avisar(pedidoId: number): Promise<boolean> {
    const pedido = await this.repository.buscarParaAvisoListo(pedidoId);
    // Solo pedidos para llevar, de un cliente, con todos sus platillos listos
    if (
      pedido === null ||
      pedido.tipo !== TipoPedido.LLEVAR ||
      pedido.estado !== EstadoPedido.LISTO ||
      pedido.clienteId === null
    ) {
      return false;
    }

    const numero = pedido.numero ?? `#${pedido.id}`;
    // La clave única (PEDIDO_LISTO, id, cliente) evita un segundo aviso
    const { registradas } = await this.notificaciones.notificar({
      destinatario: { usuarioId: pedido.clienteId },
      titulo: 'Tu pedido está listo',
      mensaje: `Tu pedido ${numero} ya está listo para recoger en la sucursal ${pedido.sucursal.nombre}.`,
      moduloOrigen: ModuloOrigen.PEDIDOS,
      referencia: { tipo: 'PEDIDO_LISTO', id: String(pedido.id) },
      enviarCorreo: true,
    });
    return registradas > 0;
  }
}
