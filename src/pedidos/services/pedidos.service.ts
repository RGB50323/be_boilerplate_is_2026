import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EstadoItem, Prisma, type User } from '@PrismaClient';
import type {
  AgregarItemsDto,
  CambiarItemDto,
  CrearPedidoDto,
  ItemsAgregadosResponseDto,
  PedidoCreadoResponseDto,
  PedidoTotalResponseDto,
} from '../dto/index.js';
import {
  DisponibilidadInsuficienteError,
  ESTADOS_CERRADOS,
  ItemNoModificableError,
  PedidoSinItemsError,
  PedidosRepository,
  type ItemExistente,
  type ItemNuevo,
} from '../repositories/pedidos.repository.js';

const SIN_PERMISO = 'No tienes permiso para registrar pedidos en esta mesa.';
const SIN_PERMISO_PEDIDO = 'No tienes permiso para modificar este pedido.';
const ITEM_LISTO = 'Este platillo ya está listo y no se puede modificar.';

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
      throw this.traducir(error);
    }
  }

  async agregarItems(
    pedidoId: number,
    dto: AgregarItemsDto,
    usuario: User,
  ): Promise<ItemsAgregadosResponseDto> {
    const pedido = await this.obtenerPedidoAbierto(pedidoId, usuario);
    const items = await this.armarItems(dto.items, pedido.sucursalId);

    try {
      const { total, agregados } = await this.repository.agregarItems(
        pedido.id,
        pedido.sucursalId,
        items,
      );
      return {
        pedidoId: pedido.id,
        total: total.toNumber(),
        itemsAgregados: agregados.map((a) => ({
          itemId: a.id,
          platilloId: a.platilloId,
          cantidad: a.cantidad,
          estado: a.estado,
        })),
      };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async cambiarItem(
    pedidoId: number,
    itemId: number,
    dto: CambiarItemDto,
    usuario: User,
  ): Promise<PedidoTotalResponseDto> {
    if (dto.cantidad === undefined && dto.nota === undefined) {
      throw new BadRequestException('Indica la cantidad o la nota a cambiar.');
    }
    const pedido = await this.obtenerPedidoAbierto(pedidoId, usuario);
    const item = await this.obtenerItemPendiente(pedido.id, itemId);

    try {
      const total = await this.repository.cambiarItem(
        pedido.id,
        pedido.sucursalId,
        item,
        {
          cantidad: dto.cantidad,
          nota: dto.nota === undefined ? undefined : dto.nota || null,
        },
      );
      return { pedidoId: pedido.id, total: total.toNumber() };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async quitarItem(
    pedidoId: number,
    itemId: number,
    usuario: User,
  ): Promise<PedidoTotalResponseDto> {
    const pedido = await this.obtenerPedidoAbierto(pedidoId, usuario);
    const item = await this.obtenerItemPendiente(pedido.id, itemId);

    try {
      const total = await this.repository.quitarItem(
        pedido.id,
        pedido.sucursalId,
        item,
      );
      return { pedidoId: pedido.id, total: total.toNumber() };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  private async obtenerPedidoAbierto(id: number, usuario: User) {
    const sucursalId = usuario.sucursalId;
    if (sucursalId === null) throw new ForbiddenException(SIN_PERMISO_PEDIDO);

    const pedido = await this.repository.buscarPedido(id);
    if (pedido === null) throw new NotFoundException('El pedido no existe.');
    if (pedido.sucursalId !== sucursalId) {
      throw new ForbiddenException(SIN_PERMISO_PEDIDO);
    }
    if (ESTADOS_CERRADOS.includes(pedido.estado)) {
      throw new ConflictException('El pedido ya está cerrado.');
    }
    return pedido;
  }

  private async obtenerItemPendiente(
    pedidoId: number,
    itemId: number,
  ): Promise<ItemExistente> {
    const item = await this.repository.buscarItem(pedidoId, itemId);
    if (item === null) {
      throw new NotFoundException('El platillo del pedido no existe.');
    }
    if (item.estado !== EstadoItem.PENDIENTE) {
      throw new ConflictException(ITEM_LISTO);
    }
    return item;
  }

  private mesaOcupada() {
    return new ConflictException(
      'La mesa ya tiene un pedido abierto. Agrega los platillos a ese pedido.',
    );
  }

  private traducir(error: unknown): unknown {
    if (error instanceof DisponibilidadInsuficienteError) {
      return new UnprocessableEntityException(
        'Un platillo se quedó sin disponibilidad. Revisa el pedido.',
      );
    }
    if (error instanceof ItemNoModificableError) {
      return new ConflictException(ITEM_LISTO);
    }
    if (error instanceof PedidoSinItemsError) {
      return new ConflictException('El pedido debe conservar al menos un platillo.');
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return this.mesaOcupada();
    }
    return error;
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