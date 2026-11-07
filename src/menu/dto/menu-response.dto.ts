import { ApiProperty } from '@nestjs/swagger';

export class PlatilloMenuDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 'Pupusa revuelta' })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ example: 1.25 })
  precio!: number;

  @ApiProperty({ type: String, nullable: true })
  imagenUrl!: string | null;

  @ApiProperty({ example: 40 })
  disponibilidad!: number;
}

export class CategoriaMenuDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'Platillos principales' })
  nombre!: string;

  @ApiProperty({ type: [PlatilloMenuDto] })
  platillos!: PlatilloMenuDto[];
}

export class MenuResponseDto {
  @ApiProperty({ example: 1 })
  sucursalId!: number;

  @ApiProperty({ type: [CategoriaMenuDto] })
  categorias!: CategoriaMenuDto[];
}
