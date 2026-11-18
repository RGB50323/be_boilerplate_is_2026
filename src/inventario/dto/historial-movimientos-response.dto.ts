import { ApiProperty } from '@nestjs/swagger';
import { TipoMovimientoInsumo } from '@PrismaClient';

export class MovimientoInsumoDto {
  @ApiProperty({ example: 88 })
  id!: number;

  @ApiProperty({ description: 'Fecha local (America/El_Salvador).', example: '2026-11-17' })
  fecha!: string;

  @ApiProperty({ description: 'Hora local (America/El_Salvador), en HH:mm.', example: '14:05' })
  hora!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre del usuario que registró el movimiento (su email si no tiene nombre).',
    example: 'Ana López',
  })
  usuario!: string | null;

  @ApiProperty({
    enum: TipoMovimientoInsumo,
    enumName: 'TipoMovimientoInsumo',
    example: TipoMovimientoInsumo.SALIDA,
  })
  tipo!: TipoMovimientoInsumo;

  @ApiProperty({ example: 3 })
  cantidad!: number;

  @ApiProperty({ example: 'Uso en cocina' })
  motivo!: string;
}

export class HistorialMovimientosResponseDto {
  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 3 })
  totalPaginas!: number;

  @ApiProperty({ example: 23 })
  total!: number;

  @ApiProperty({
    type: [MovimientoInsumoDto],
    description: 'Del movimiento más reciente al más antiguo.',
  })
  datos!: MovimientoInsumoDto[];
}
