import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';
import { DistribucionEstrellasDto } from './resenas-response.dto.js';

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

export class ReporteResenasQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha local inicial de El Salvador, inclusive (YYYY-MM-DD).',
    example: '2026-11-01',
  })
  @IsOptional()
  @Matches(FORMATO, { message: 'desde debe tener el formato YYYY-MM-DD.' })
  @IsDateString(
    { strict: true },
    { message: 'desde debe ser una fecha válida.' },
  )
  desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha local final de El Salvador, inclusive (YYYY-MM-DD).',
    example: '2026-11-30',
  })
  @IsOptional()
  @Matches(FORMATO, { message: 'hasta debe tener el formato YYYY-MM-DD.' })
  @IsDateString(
    { strict: true },
    { message: 'hasta debe ser una fecha válida.' },
  )
  hasta?: string;
}

export class ReporteResenasResponseDto {
  @ApiProperty({ example: 'Centro' })
  sucursal!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.3,
    description:
      'Promedio con un decimal; null si no hay reseñas en el periodo.',
  })
  promedio!: number | null;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ type: DistribucionEstrellasDto })
  distribucion!: DistribucionEstrellasDto;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-01' })
  desde!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-30' })
  hasta!: string | null;
}
