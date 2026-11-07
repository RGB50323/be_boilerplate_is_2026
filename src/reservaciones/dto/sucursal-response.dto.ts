import { ApiProperty } from '@nestjs/swagger';

export class HorarioSucursalResponseDto {
  @ApiProperty({
    description: 'Domingo = 0, lunes = 1, ..., sábado = 6.',
    minimum: 0,
    maximum: 6,
    example: 1,
  })
  diaSemana!: number;

  @ApiProperty({
    description: 'Hora local de apertura en America/El_Salvador (HH:mm).',
    example: '08:00',
  })
  apertura!: string;

  @ApiProperty({
    description: 'Hora local de cierre en America/El_Salvador (HH:mm).',
    example: '21:00',
  })
  cierre!: string;
}

export class SucursalResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Centro' })
  nombre!: string;

  @ApiProperty({
    type: HorarioSucursalResponseDto,
    isArray: true,
    description: 'Horarios registrados, ordenados por día. Puede estar vacío.',
  })
  horarios!: HorarioSucursalResponseDto[];
}
