import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const PAGINA_MAXIMA = 1000;

// Query común ?pagina=N para listados paginados
export class PaginacionQueryDto {
  @ApiPropertyOptional({
    description: 'Página solicitada (empieza en 1)',
    default: 1,
    minimum: 1,
    maximum: PAGINA_MAXIMA,
  })
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1.' })
  @Max(PAGINA_MAXIMA, {
    message: `La página debe ser menor o igual a ${PAGINA_MAXIMA}.`,
  })
  pagina: number = 1;
}
