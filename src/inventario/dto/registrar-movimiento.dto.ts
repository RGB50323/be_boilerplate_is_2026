import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { TipoMovimientoInsumo } from '@PrismaClient';
import { CANTIDAD_MAXIMA } from '@Inventario/utils';

export class RegistrarMovimientoDto {
  @ApiProperty({
    enum: TipoMovimientoInsumo,
    enumName: 'TipoMovimientoInsumo',
    example: TipoMovimientoInsumo.SALIDA,
  })
  @IsEnum(TipoMovimientoInsumo, {
    message: 'El tipo debe ser ENTRADA o SALIDA.',
  })
  tipo!: TipoMovimientoInsumo;

  @ApiProperty({ example: 3, exclusiveMinimum: true, minimum: 0 })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    {
      message:
        'La cantidad es obligatoria y debe ser un número con máximo tres decimales.',
    },
  )
  @IsPositive({ message: 'La cantidad debe ser mayor a 0.' })
  @Max(CANTIDAD_MAXIMA, { message: 'La cantidad es demasiado grande.' })
  cantidad!: number;

  @ApiProperty({ example: 'Uso en cocina', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El motivo debe ser texto.' })
  @IsNotEmpty({ message: 'El motivo es obligatorio.' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres.' })
  motivo!: string;
}
