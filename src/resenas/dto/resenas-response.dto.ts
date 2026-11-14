import { ApiProperty } from '@nestjs/swagger';

export class ResenaDto {
  @ApiProperty({ example: 501 })
  id!: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  estrellas!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Las pupusas estaban increíbles',
  })
  comentario!: string | null;

  @ApiProperty({ example: '2026-10-28' })
  fecha!: string;

  @ApiProperty({ example: 'Ana L.' })
  cliente!: string;
}

export class ResenasPlatilloResponseDto {
  @ApiProperty({ type: Number, nullable: true, example: 4.6 })
  promedio!: number | null;

  @ApiProperty({ example: 23 })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 3 })
  totalPaginas!: number;

  @ApiProperty({ type: [ResenaDto] })
  resenas!: ResenaDto[];
}
