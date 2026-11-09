import { Type } from 'class-transformer';
import { IsDateString, IsInt, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConsultarDisponibilidadDto {
  @ApiProperty({
    description: 'Fecha local de El Salvador (YYYY-MM-DD).',
    example: '2026-11-09',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha debe tener el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true },
    { message: 'fecha debe ser una fecha válida.' },
  )
  fecha!: string;

  @ApiProperty({
    description: 'Hora local, en intervalos de 30 minutos (HH:mm).',
    example: '19:00',
  })
  @Matches(/^(?:[01]\d|2[0-3]):(?:00|30)$/, {
    message: 'hora debe tener el formato HH:mm, con minutos 00 o 30.',
  })
  hora!: string;

  @ApiProperty({ description: 'Cantidad de personas.', minimum: 1, example: 4 })
  @Type(() => Number)
  @IsInt({ message: 'personas debe ser un número entero.' })
  @Min(1, { message: 'personas debe ser al menos 1.' })
  @Max(2147483647, { message: 'personas excede el máximo permitido.' })
  personas!: number;
}
