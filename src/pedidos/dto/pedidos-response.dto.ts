import { ApiProperty } from '@nestjs/swagger';

export class PedidoCreadoResponseDto {
  @ApiProperty({ example: 120 })
  pedidoId!: number;

  @ApiProperty({ example: 'S1-000120' })
  numero!: string;

  @ApiProperty({ example: 'ENVIADO_COCINA' })
  estado!: string;

  @ApiProperty({ example: 3.75 })
  total!: number;

  @ApiProperty({ example: '2026-10-30T18:05:00.000Z' })
  creadoEn!: string;
}

export class ItemAgregadoResponseDto {
  @ApiProperty({ example: 305 })
  itemId!: number;

  @ApiProperty({ example: 12 })
  platilloId!: number;

  @ApiProperty({ example: 2 })
  cantidad!: number;

  @ApiProperty({ example: 'PENDIENTE' })
  estado!: string;
}

export class ItemsAgregadosResponseDto {
  @ApiProperty({ example: 120 })
  pedidoId!: number;

  @ApiProperty({ example: 6.75 })
  total!: number;

  @ApiProperty({ type: [ItemAgregadoResponseDto] })
  itemsAgregados!: ItemAgregadoResponseDto[];
}

export class PedidoTotalResponseDto {
  @ApiProperty({ example: 120 })
  pedidoId!: number;

  @ApiProperty({ example: 5.5 })
  total!: number;
}

export class MesaResponseDto {
  @ApiProperty({ example: 4 })
  id!: number;

  @ApiProperty({ example: 4 })
  numero!: number;

  @ApiProperty({ example: 4 })
  capacidad!: number;

  @ApiProperty({ example: 'Terraza', nullable: true })
  zona!: string | null;

  @ApiProperty({ example: true })
  activa!: boolean;

  @ApiProperty({ example: 120, nullable: true })
  pedidoAbiertoId!: number | null;
}

export class ItemDetalleResponseDto {
  @ApiProperty({ example: 305 })
  itemId!: number;

  @ApiProperty({ example: 12 })
  platilloId!: number;

  @ApiProperty({ example: 'Hamburguesa' })
  nombre!: string;

  @ApiProperty({ example: 2 })
  cantidad!: number;

  @ApiProperty({ example: 3.75 })
  precioUnitario!: number;

  @ApiProperty({ example: 'sin cebolla', nullable: true })
  nota!: string | null;

  @ApiProperty({ example: 'PENDIENTE' })
  estado!: string;
}

export class PedidoDetalleResponseDto {
  @ApiProperty({ example: 120 })
  pedidoId!: number;

  @ApiProperty({ example: 'S1-000120', nullable: true })
  numero!: string | null;

  @ApiProperty({ example: 'ENVIADO_COCINA' })
  estado!: string;

  @ApiProperty({ example: 4, nullable: true })
  mesaId!: number | null;

  @ApiProperty({ example: 7.5 })
  total!: number;

  @ApiProperty({ example: '2026-10-30T18:05:00.000Z' })
  creadoEn!: string;

  @ApiProperty({ type: [ItemDetalleResponseDto] })
  items!: ItemDetalleResponseDto[];
}

export class PedidoLlevarCreadoResponseDto {
  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ example: 'PENDIENTE_PAGO' })
  estado!: string;

  @ApiProperty({ example: 8.5 })
  total!: number;
}

export class PedidoRecibidoResponseDto {
  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ example: 'S1-000121', nullable: true })
  numero!: string | null;

  @ApiProperty({ example: 'RECIBIDO' })
  estado!: string;
}

export class PedidoCanceladoResponseDto {
  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ example: 'CANCELADO' })
  estado!: string;

  @ApiProperty({ example: 'REEMBOLSADO' })
  pago!: string;
}

export class PedidoSeguimientoResponseDto {
  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ example: 'S1-000121', nullable: true })
  numero!: string | null;

  @ApiProperty({ example: 'RECIBIDO' })
  estado!: string;

  @ApiProperty({ example: 'Centro' })
  sucursal!: string;

  @ApiProperty({ example: 'Ana López', nullable: true })
  nombreCliente!: string | null;

  @ApiProperty({ example: 17.98 })
  total!: number;

  @ApiProperty({ example: '2026-11-14T18:00:00.000Z' })
  creadoEn!: string;

  @ApiProperty({
    example: 'CONFIRMADO',
    nullable: true,
    description: 'Último pago del pedido; null si aún no tiene.',
  })
  pago!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  comprobanteId!: number | null;

  @ApiProperty({ type: [ItemDetalleResponseDto] })
  items!: ItemDetalleResponseDto[];
}

export class PedidoResumenResponseDto {
  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ example: 'S1-000121', nullable: true })
  numero!: string | null;

  @ApiProperty({ example: 'RECIBIDO' })
  estado!: string;

  @ApiProperty({ example: 'Centro' })
  sucursal!: string;

  @ApiProperty({ example: 17.98 })
  total!: number;

  @ApiProperty({ example: '2026-11-14T18:00:00.000Z' })
  creadoEn!: string;
}

export class PedidosPaginadosResponseDto {
  @ApiProperty({ type: [PedidoResumenResponseDto] })
  datos!: PedidoResumenResponseDto[];

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 1 })
  totalPaginas!: number;

  @ApiProperty({ example: 1 })
  total!: number;
}