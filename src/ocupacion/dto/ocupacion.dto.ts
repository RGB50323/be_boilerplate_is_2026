import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class OcupacionQueryDto {
  @ApiProperty({
    description: 'Fecha a consultar en formato local de El Salvador (YYYY-MM-DD)',
    example: '2026-11-20',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true },
    { message: 'La fecha debe ser una fecha válida.' },
  )
  fecha!: string;
}

export class BloqueOcupacionDto {
  @ApiProperty({ example: '08:00' })
  horaInicio!: string;

  @ApiProperty({ example: '09:00' })
  horaFin!: string;

  @ApiProperty({ example: 2 })
  mesasReservadas!: number;

  @ApiProperty({ example: 8 })
  mesasDisponibles!: number;

  @ApiProperty({
    example: 20,
    nullable: true,
    description:
      'Porcentaje de ocupación (0-100) con hasta 2 decimales; null si no hay mesas activas.',
  })
  porcentajeOcupacion!: number | null;
}

export class OcupacionResponseDto {
  @ApiProperty({ example: '2026-11-20' })
  fecha!: string;

  @ApiProperty({ example: 1 })
  sucursalId!: number;

  @ApiProperty({ example: 'Centro' })
  sucursal!: string;

  @ApiProperty({ example: 10 })
  mesasActivas!: number;

  @ApiProperty({
    example: true,
    description: 'Indica si fue posible calcular la ocupación (mesasActivas > 0).',
  })
  calculable!: boolean;

  @ApiProperty({ type: [BloqueOcupacionDto] })
  bloques!: BloqueOcupacionDto[];
}
