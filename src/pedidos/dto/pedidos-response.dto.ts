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