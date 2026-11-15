import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoPedido, Prisma, Rol, TipoPedido, type User } from '@PrismaClient';
import type {
  CrearPedidoDto,
  PedidoCanceladoResponseDto,
  PedidoLlevarCreadoResponseDto,
  PedidoRecibidoResponseDto,
} from '../dto/index.js';
import {
  PedidoNoCancelableError,
  PedidosLlevarRepository,
} from '../repositories/pedidos-llevar.repository.js';
import { PedidosService } from './pedidos.service.js';

const SIN_PERMISO = 'No tienes permiso para realizar esta acción.';
const NO_CANCELABLE = 'El pedido ya no se puede cancelar.';

@Injectable()
export class PedidosLlevarService {
  constructor(
    private readonly repository: PedidosLlevarRepository,
    private readonly pedidos: PedidosService,
  ) {}

  async crear(
    dto: CrearPedidoDto,
    usuario: User,
  ): Promise<PedidoLlevarCreadoResponseDto> {
    if (usuario.rol !== Rol.CLIENTE) throw new ForbiddenException(SIN_PERMISO);
    if (dto.sucursalId === undefined || dto.nombreCliente === undefined) {
      throw new BadRequestException('Ingresa tu nombre completo.');
    }
    if ((await this.repository.buscarSucursal(dto.sucursalId)) === null) {
      throw new NotFoundException('La sucursal no existe.');
    }

    const items = await this.pedidos.armarItems(dto.items, dto.sucursalId);
    const total = items.reduce(
      (suma, item) => suma.plus(item.precioUnitario.mul(item.cantidad)),
      new Prisma.Decimal(0),
    );

    try {
      const pedido = await this.repository.crear({
        sucursalId: dto.sucursalId,
        clienteId: usuario.id,
        nombreCliente: dto.nombreCliente,
        total,
        items,
      });
      return {
        pedidoId: pedido.id,
        estado: pedido.estado,
        total: pedido.total.toNumber(),
      };
    } catch (error) {
      throw this.pedidos.traducir(error);
    }
  }

  async confirmarPago(pedidoId: number): Promise<PedidoRecibidoResponseDto> {
    const pedido = await this.repository.confirmarPago(pedidoId);
    if (pedido === null) {
      throw new NotFoundException('El pedido para llevar no existe.');
    }
    return {
      pedidoId: pedido.id,
      numero: pedido.numero,
      estado: pedido.estado,
    };
  }

  async cancelar(
    id: number,
    usuario: User,
  ): Promise<PedidoCanceladoResponseDto> {
    if (usuario.rol !== Rol.CLIENTE) throw new ForbiddenException(SIN_PERMISO);

    const pedido = await this.repository.buscarPedido(id);
    if (pedido === null) throw new NotFoundException('El pedido no existe.');
    if (pedido.tipo !== TipoPedido.LLEVAR || pedido.clienteId !== usuario.id) {
      throw new ForbiddenException('Este pedido no es tuyo.');
    }
    if (pedido.estado !== EstadoPedido.RECIBIDO) {
      throw new ConflictException(NO_CANCELABLE);
    }

    try {
      await this.repository.cancelar(pedido.id, pedido.sucursalId);
    } catch (error) {
      if (error instanceof PedidoNoCancelableError) {
        throw new ConflictException(NO_CANCELABLE);
      }
      throw error;
    }
    return { pedidoId: pedido.id, estado: 'CANCELADO', pago: 'REEMBOLSADO' };
  }
}