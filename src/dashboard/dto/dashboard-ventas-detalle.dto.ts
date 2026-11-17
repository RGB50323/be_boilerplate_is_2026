import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoPedido } from '@PrismaClient';
import { DashboardRangoQueryDto } from './dashboard-ventas-query.dto.js';

export class DashboardVentasDetalleQueryDto extends DashboardRangoQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero.' })
  @Min(1, { message: 'pagina debe ser mayor que 0.' })
  @Max(2147483647, { message: 'pagina excede el máximo permitido.' })
  pagina: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'porPagina debe ser un número entero.' })
  @Min(1, { message: 'porPagina debe estar entre 1 y 100.' })
  @Max(100, { message: 'porPagina debe estar entre 1 y 100.' })
  porPagina: number = 20;
}

export class VentaConfirmadaDto {
  @ApiProperty({ example: 152 })
  pedidoId!: number;

  @ApiProperty({ type: String, nullable: true, example: 'DEMO-00152' })
  numero!: string | null;

  @ApiProperty({ example: 1 })
  sucursalId!: number;

  @ApiProperty({ example: 'Centro' })
  sucursal!: string;

  @ApiProperty({
    description: 'Momento en que se confirmó el pago (ISO 8601, UTC).',
    example: '2026-11-08T18:05:00.000Z',
  })
  fecha!: string;

  @ApiProperty({ enum: TipoPedido, enumName: 'TipoPedido', example: TipoPedido.MESA })
  tipo!: TipoPedido;

  @ApiProperty({ description: 'Suma de cantidades del pedido.', example: 3 })
  articulos!: number;

  @ApiProperty({ example: 25 })
  subtotal!: number;

  @ApiProperty({ example: 2.5 })
  descuentos!: number;

  @ApiProperty({ description: 'Subtotal − descuentos (sin IVA ni propina).', example: 22.5 })
  venta!: number;
}

export class VentasDetalleResponseDto {
  @ApiProperty({
    type: VentaConfirmadaDto,
    isArray: true,
    description: 'De la más reciente a la más antigua.',
  })
  items!: VentaConfirmadaDto[];

  @ApiProperty({ description: 'Total de ventas del periodo (todas las páginas).', example: 168 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  porPagina!: number;
}
