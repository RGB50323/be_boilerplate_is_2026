import { Type } from 'class-transformer';
import { IsInt, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConsultarDisponibilidadDto } from './consultar-disponibilidad.dto.js';

export class IdReservacionDto {
  @Matches(/^R-\d{1,10}$/, {
    message: 'Identificador de reservación inválido.',
  })
  id!: string;
}

export class ModificarReservacionDto extends ConsultarDisponibilidadDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  mesaId!: number;

  @ApiProperty({ description: 'Versión recibida al consultar el detalle.' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  version!: string;
}
