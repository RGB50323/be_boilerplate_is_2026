import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import type {
  PlatilloPendienteResenaDto,
  PublicarResenaDto,
  ResenaPublicadaResponseDto,
} from '../dto/index.js';
import { ResenaRepository } from '../repositories/index.js';

export const DIAS_PARA_RESENAR = 7;
const PLAZO_MS = DIAS_PARA_RESENAR * 24 * 60 * 60_000;

const fechaLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
});

const fechaDelPago = (pago: { confirmadoEn: Date | null; creadoEn: Date }) =>
  pago.confirmadoEn ?? pago.creadoEn;

@Injectable()
export class ResenasClienteService {
  constructor(private readonly repository: ResenaRepository) {}

  async publicar(
    clienteId: string,
    dto: PublicarResenaDto,
    ahora = new Date(),
  ): Promise<ResenaPublicadaResponseDto> {
    const pedido = await this.repository.buscarPedidoParaResena(
      dto.pedidoId,
      dto.platilloId,
    );
    if (pedido === null) throw new NotFoundException('El pedido no existe.');
    if (pedido.clienteId !== clienteId) {
      throw new ForbiddenException('Este pedido no es tuyo.');
    }
    if (pedido.detalles.length === 0) {
      throw new NotFoundException('Ese platillo no está en tu pedido.');
    }

    const pago = pedido.pagos[0];
    if (pago === undefined) {
      throw new UnprocessableEntityException(
        'Solo puedes reseñar pedidos con pago confirmado.',
      );
    }
    if (ahora.getTime() - fechaDelPago(pago).getTime() > PLAZO_MS) {
      throw new UnprocessableEntityException(
        `Solo puedes reseñar hasta ${DIAS_PARA_RESENAR} días después del pago.`,
      );
    }

    try {
      const resena = await this.repository.crear({
        pedidoId: dto.pedidoId,
        platilloId: dto.platilloId,
        clienteId,
        estrellas: dto.estrellas,
        comentario: dto.comentario ?? null,
      });
      return {
        mensaje: 'Reseña publicada correctamente',
        resena: {
          id: resena.id,
          pedidoId: resena.pedidoId,
          platilloId: resena.platilloId,
          estrellas: resena.estrellas,
          comentario: resena.comentario,
          fecha: fechaLocal.format(resena.creadaEn),
        },
      };
    } catch (error) {
      // UNIQUE (pedido_id, platillo_id): ya existe la reseña
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya reseñaste este platillo en este pedido.',
        );
      }
      throw error;
    }
  }

  async pendientes(
    clienteId: string,
    ahora = new Date(),
  ): Promise<PlatilloPendienteResenaDto[]> {
    const pedidos = await this.repository.pedidosPorResenar(
      clienteId,
      new Date(ahora.getTime() - PLAZO_MS),
    );

    const pendientes: PlatilloPendienteResenaDto[] = [];
    for (const pedido of pedidos) {
      const pago = pedido.pagos[0];
      if (pago === undefined) continue;
      const hasta = new Date(fechaDelPago(pago).getTime() + PLAZO_MS);
      const vistos = new Set(pedido.resenas.map((r) => r.platilloId));

      // Un platillo repetido en el pedido se reseña una sola vez
      for (const detalle of pedido.detalles) {
        if (vistos.has(detalle.platilloId)) continue;
        vistos.add(detalle.platilloId);
        pendientes.push({
          pedidoId: pedido.id,
          numero: pedido.numero,
          sucursal: pedido.sucursal.nombre,
          platilloId: detalle.platilloId,
          nombre: detalle.platillo.nombre,
          disponibleHasta: hasta.toISOString(),
        });
      }
    }
    return pendientes;
  }
}
