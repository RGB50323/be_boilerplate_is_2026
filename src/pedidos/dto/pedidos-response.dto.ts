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