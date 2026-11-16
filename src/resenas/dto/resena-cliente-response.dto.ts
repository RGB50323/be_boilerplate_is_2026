import { ApiProperty } from '@nestjs/swagger';

export class ResenaPublicadaDto {
  @ApiProperty({ example: 501 })
  id!: number;

  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ example: 10 })
  platilloId!: number;

  @ApiProperty({ example: 5 })
  estrellas!: number;

  @ApiProperty({ type: String, nullable: true, example: 'Muy buenas' })
  comentario!: string | null;

  @ApiProperty({ example: '2026-11-15' })
  fecha!: string;
}

export class ResenaPublicadaResponseDto {
  @ApiProperty({ example: 'Reseña publicada correctamente' })
  mensaje!: string;

  @ApiProperty({ type: ResenaPublicadaDto })
  resena!: ResenaPublicadaDto;
}

export class PlatilloPendienteResenaDto {
  @ApiProperty({ example: 121 })
  pedidoId!: number;

  @ApiProperty({ type: String, nullable: true, example: 'S1-000121' })
  numero!: string | null;

  @ApiProperty({ example: 'Centro' })
  sucursal!: string;

  @ApiProperty({ example: 10 })
  platilloId!: number;

  @ApiProperty({ example: 'Pupusas revueltas' })
  nombre!: string;

  @ApiProperty({
    example: '2026-11-22T18:00:00.000Z',
    description: 'Hasta cuándo se puede reseñar (7 días después del pago)',
  })
  disponibleHasta!: string;
}
