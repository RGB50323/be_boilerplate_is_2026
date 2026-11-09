import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CambiarCategoriaPlatilloDto {
  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt({ message: 'categoriaId debe ser un número entero.' })
  @Min(1, { message: 'categoriaId debe ser mayor o igual a 1.' })
  categoriaId!: number;
}
