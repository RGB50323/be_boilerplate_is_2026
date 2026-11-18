import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CANTIDAD_MAXIMA,
  UNIDADES_INSUMO,
  type UnidadInsumoApi,
} from '@Inventario/utils';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearInsumoDto {
  @ApiProperty({ example: 'Masa de maíz', maxLength: 100 })
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre del insumo es obligatorio.' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres.' })
  nombre!: string;

  @ApiProperty({ enum: UNIDADES_INSUMO, example: 'lb' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty({ message: 'La unidad es obligatoria.' })
  @IsIn(UNIDADES_INSUMO, {
    message: `La unidad debe ser una de: ${UNIDADES_INSUMO.join(', ')}.`,
  })
  unidad!: UnidadInsumoApi;

  @ApiProperty({ example: 20, minimum: 0 })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    {
      message:
        'El mínimo es obligatorio y debe ser un número con máximo tres decimales.',
    },
  )
  @Min(0, { message: 'El mínimo no puede ser negativo.' })
  @Max(CANTIDAD_MAXIMA, { message: 'El mínimo es demasiado grande.' })
  minimo!: number;
}
