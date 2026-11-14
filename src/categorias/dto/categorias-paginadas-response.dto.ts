import { ApiProperty } from '@nestjs/swagger';
import { CategoriaListadoResponseDto } from './index.js';

export class CategoriasPaginadasResponseDto {
  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 2 })
  totalPaginas!: number;

  @ApiProperty({ example: 14 })
  total!: number;

  @ApiProperty({ type: [CategoriaListadoResponseDto] })
  datos!: CategoriaListadoResponseDto[];
}
