import { ApiProperty } from '@nestjs/swagger';

export class PlatilloResponseDto {
  @ApiProperty({ example: 10 }) id!: number;
  @ApiProperty({ example: 'Pupusa revuelta' }) nombre!: string;
  @ApiProperty({ type: String, nullable: true }) descripcion!: string | null;
  @ApiProperty({ type: String, nullable: true }) imagenUrl!: string | null;
  @ApiProperty({ example: 2 }) categoriaId!: number;
  @ApiProperty({ example: 'Platos típicos' }) categoriaNombre!: string;
  @ApiProperty({ example: 1.25 }) precio!: number;
  @ApiProperty({ example: 40 }) disponibilidad!: number;
  @ApiProperty({ example: true }) activo!: boolean;
}

export class PlatilloDeshabilitadoResponseDto {
  @ApiProperty({ example: 10 }) id!: number;
  @ApiProperty({ example: false }) activo!: boolean;
}
