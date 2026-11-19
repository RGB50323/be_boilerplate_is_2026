import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoPedido,
  Prisma,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import type {
  CrearPedidoDto,
  PedidoCanceladoResponseDto,
  PedidoLlevarCreadoResponseDto,
  PedidoRecibidoResponseDto,
  PedidoSeguimientoResponseDto,
} from '../dto/index.js';
import {
  PedidoNoCancelableError,
  PedidosLlevarRepository,
} from '../repositories/pedidos-llevar.repository.js';
import { PedidosService } from './pedidos.service.js';
import { paginar } from '@Common/paginacion';

const SIN_PERMISO = 'No tienes permiso para realizar esta acción.';
const NO_CANCELABLE = 'El pedido ya no se puede cancelar.';
const PEDIDOS_POR_PAGINA = 10;

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

  async obtenerSeguimiento(
    id: number,
    usuario: User,
  ): Promise<PedidoSeguimientoResponseDto> {
    if (usuario.rol !== Rol.CLIENTE) throw new ForbiddenException(SIN_PERMISO);

    const pedido = await this.repository.buscarSeguimiento(id);
    if (pedido === null) throw new NotFoundException('El pedido no existe.');
    if (pedido.tipo !== TipoPedido.LLEVAR || pedido.clienteId !== usuario.id) {
      throw new ForbiddenException('Este pedido no es tuyo.');
    }

    return {
      pedidoId: pedido.id,
      numero: pedido.numero,
      estado: pedido.estado,
      sucursal: pedido.sucursal.nombre,
      nombreCliente: pedido.nombreCliente,
      total: pedido.total.toNumber(),
      creadoEn: pedido.creadoEn.toISOString(),
      pago: pedido.pagos[0]?.estado ?? null,
      comprobanteId: pedido.pagos[0]?.comprobante?.id ?? null,
      items: pedido.detalles.map((d) => ({
        itemId: d.id,
        platilloId: d.platilloId,
        nombre: d.platillo.nombre,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario.toNumber(),
        nota: d.nota,
        estado: d.estado,
      })),
    };
  }

  async listarMios(usuario: User, pagina: number) {
    if (usuario.rol !== Rol.CLIENTE) throw new ForbiddenException(SIN_PERMISO);

    const [pedidos, total] = await this.repository.listarPorCliente(
      usuario.id,
      pagina,
      PEDIDOS_POR_PAGINA,
    );
    return paginar(
      pedidos.map((p) => ({
        pedidoId: p.id,
        numero: p.numero,
        estado: p.estado,
        sucursal: p.sucursal.nombre,
        total: p.total.toNumber(),
        creadoEn: p.creadoEn.toISOString(),
      })),
      total,
      pagina,
      PEDIDOS_POR_PAGINA,
    );
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
