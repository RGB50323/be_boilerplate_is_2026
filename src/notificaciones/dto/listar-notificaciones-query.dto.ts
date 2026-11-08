import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListarNotificacionesQueryDto {
  @ApiPropertyOptional({
    description:
      'Página solicitada; cada página contiene hasta 20 notificaciones.',
    default: 1,
    minimum: 1,
    maximum: 1000,
  })
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1.' })
  @Max(1000, { message: 'La página debe ser menor o igual a 1000.' })
  pagina = 1;
}
