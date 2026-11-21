import { ApiProperty } from '@nestjs/swagger';
import { PlatilloResponseDto } from './index.js';

export class PlatillosPaginadosResponseDto {
  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 3 })
  totalPaginas!: number;

  @ApiProperty({ example: 23 })
  total!: number;

  @ApiProperty({ type: [PlatilloResponseDto] })
  datos!: PlatilloResponseDto[];
}