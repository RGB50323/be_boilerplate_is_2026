import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardVentasQueryDto {
  @ApiProperty({
    description: 'Fecha local inicial de El Salvador, inclusive (YYYY-MM-DD).',
    example: '2026-11-01',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'desde debe tener el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true },
    { message: 'desde debe ser una fecha válida.' },
  )
  desde!: string;

  @ApiProperty({
    description: 'Fecha local final de El Salvador, inclusive (YYYY-MM-DD).',
    example: '2026-11-30',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'hasta debe tener el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true },
    { message: 'hasta debe ser una fecha válida.' },
  )
  hasta!: string;

  @ApiPropertyOptional({
    description: 'Sucursal a consultar. Si se omite, se incluyen todas.',
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sucursalId debe ser un número entero.' })
  @Min(1, { message: 'sucursalId debe ser mayor que 0.' })
  @Max(2147483647, { message: 'sucursalId excede el máximo permitido.' })
  sucursalId?: number;

  @ApiPropertyOptional({
    description:
      'Día de la semana para los horarios pico (domingo = 0, ..., sábado = 6). Solo afecta horariosPico.',
    minimum: 0,
    maximum: 6,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'diaSemana debe ser un número entero.' })
  @Min(0, { message: 'diaSemana debe estar entre 0 (domingo) y 6 (sábado).' })
  @Max(6, { message: 'diaSemana debe estar entre 0 (domingo) y 6 (sábado).' })
  diaSemana?: number;
}
