import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type User } from '@PrismaClient';
import type { CrearPedidoDto, PedidoCreadoResponseDto } from '../dto/index.js';
import {
  DisponibilidadInsuficienteError,
  PedidosRepository,
  type ItemNuevo,
} from '../repositories/pedidos.repository.js';

const SIN_PERMISO = 'No tienes permiso para registrar pedidos en esta mesa.';

@Injectable()
export class PedidosService {
  constructor(private readonly repository: PedidosRepository) { }

  async crear(
    dto: CrearPedidoDto,
    usuario: User,
  ): Promise<PedidoCreadoResponseDto> {
    const sucursalId = usuario.sucursalId;
    if (sucursalId === null) throw new ForbiddenException(SIN_PERMISO);

    const mesa = await this.repository.buscarMesa(dto.mesaId);
    if (mesa === null) throw new NotFoundException('La mesa no existe.');
    if (mesa.sucursalId !== sucursalId) {
      throw new ForbiddenException(SIN_PERMISO);
    }
    if (!mesa.activa) {
      throw new UnprocessableEntityException('La mesa está fuera de servicio.');
    }
    if ((await this.repository.buscarPedidoAbierto(mesa.id)) !== null) {
      throw this.mesaOcupada();
    }

    const items = await this.armarItems(dto.items, sucursalId);
    const total = items.reduce(
      (suma, item) => suma.plus(item.precioUnitario.mul(item.cantidad)),
      new Prisma.Decimal(0),
    );

    try {
      const pedido = await this.repository.crear({
        sucursalId,
        mesaId: mesa.id,
        meseroId: usuario.id,
        total,
        items,
      });
      return {
        pedidoId: pedido.id,
        numero: pedido.numero ?? '',
        estado: pedido.estado,
        total: pedido.total.toNumber(),
        creadoEn: pedido.creadoEn.toISOString(),
      };
    } catch (error) {
      if (error instanceof DisponibilidadInsuficienteError) {
        throw new UnprocessableEntityException(
          'Un platillo se quedó sin disponibilidad. Revisa el pedido.',
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.mesaOcupada();
      }
      throw error;
    }
  }

  private mesaOcupada() {
    return new ConflictException(
      'La mesa ya tiene un pedido abierto. Agrega los platillos a ese pedido.',
    );
  }

  private async armarItems(
    pedidos: CrearPedidoDto['items'],
    sucursalId: number,
  ): Promise<ItemNuevo[]> {
    const ids = [...new Set(pedidos.map((p) => p.platilloId))];
    const platillos = await this.repository.buscarPlatillos(ids, sucursalId);
    const porId = new Map(platillos.map((p) => [p.id, p]));

    const pedidoPorPlatillo = new Map<number, number>();
    const items: ItemNuevo[] = [];

    for (const pedido of pedidos) {
      const platillo = porId.get(pedido.platilloId);
      if (platillo === undefined) {
        throw new NotFoundException(
          `El platillo ${pedido.platilloId} no existe.`,
        );
      }
      const enSucursal = platillo.sucursales[0];
      if (
        !platillo.activo ||
        !platillo.categoria.activa ||
        enSucursal === undefined
      ) {
        throw new UnprocessableEntityException(
          `El platillo "${platillo.nombre}" no está disponible.`,
        );
      }

      const acumulado =
        (pedidoPorPlatillo.get(platillo.id) ?? 0) + pedido.cantidad;
      if (acumulado > enSucursal.disponibilidad) {
        throw new UnprocessableEntityException(
          `No hay disponibilidad suficiente de "${platillo.nombre}".`,
        );
      }
      pedidoPorPlatillo.set(platillo.id, acumulado);

      items.push({
        platilloId: platillo.id,
        cantidad: pedido.cantidad,
        nota: pedido.nota ? pedido.nota : null,
        precioUnitario: enSucursal.precio,
      });
    }
    return items;
  }
}