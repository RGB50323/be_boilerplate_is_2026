import { ApiProperty } from '@nestjs/swagger';
import {
  ESTADOS_INSUMO,
  UNIDADES_INSUMO,
  type EstadoInsumo,
  type UnidadInsumoApi,
} from '@Inventario/utils';

export class InsumoResponseDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ example: 'Queso con loroco' })
  nombre!: string;

  @ApiProperty({ enum: UNIDADES_INSUMO, example: 'lb' })
  unidad!: UnidadInsumoApi;

  @ApiProperty({ example: 12.5 })
  cantidad!: number;

  @ApiProperty({ example: 10 })
  minimo!: number;

  @ApiProperty({
    enum: ESTADOS_INSUMO,
    description: 'BAJO si la cantidad es menor o igual al mínimo.',
    example: 'NORMAL',
  })
  estado!: EstadoInsumo;
}
