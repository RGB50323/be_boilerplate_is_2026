import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ListarNotificacionesQueryDto {
  @ApiPropertyOptional({
    description:
      'Página solicitada; cada página contiene hasta 20 notificaciones.',
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1.' })
  pagina = 1;
}
