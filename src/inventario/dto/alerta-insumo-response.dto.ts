import { ApiProperty } from '@nestjs/swagger';
import { EstadoAlerta } from '@PrismaClient';
import { UNIDADES_INSUMO, type UnidadInsumoApi } from '@Inventario/utils';

export class AlertaInsumoResponseDto {
  @ApiProperty({ example: 9 })
  id!: number;

  @ApiProperty({ example: 5 })
  insumoId!: number;

  @ApiProperty({ example: 'Masa de maíz' })
  insumo!: string;

  @ApiProperty({ description: 'Cantidad del insumo al crearse la alerta.', example: 18 })
  cantidad!: number;

  @ApiProperty({ description: 'Mínimo del insumo al crearse la alerta.', example: 20 })
  minimo!: number;

  @ApiProperty({ enum: UNIDADES_INSUMO, example: 'lb' })
  unidad!: UnidadInsumoApi;

  @ApiProperty({
    enum: [EstadoAlerta.ACTIVA, EstadoAlerta.VISTA],
    enumName: 'EstadoAlerta',
    example: EstadoAlerta.ACTIVA,
  })
  estado!: EstadoAlerta;

  @ApiProperty({ format: 'date-time', example: '2026-11-18T14:05:00.000Z' })
  creadaEn!: string;
}
