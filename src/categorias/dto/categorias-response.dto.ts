import { ApiProperty } from '@nestjs/swagger';

export class CategoriaResponseDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'Típicos' })
  nombre!: string;

  @ApiProperty({ example: true })
  activa!: boolean;
}

export class PlatilloCategoriaResponseDto {
  @ApiProperty({ example: 10 })
  platilloId!: number;

  @ApiProperty({ example: 2 })
  categoriaId!: number;
}

export class CategoriaDeshabilitadaResponseDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: false })
  activa!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deshabilitadaEn!: Date | null;
}
