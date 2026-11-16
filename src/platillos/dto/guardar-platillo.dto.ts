import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GuardarPlatilloDto {
  @ApiProperty({ example: 'Pupusa revuelta', maxLength: 120 })
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre del platillo es obligatorio.' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres.' })
  nombre!: string;

  @ApiProperty({ example: 'Con queso y chicharrón' })
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto.' })
  @IsNotEmpty({ message: 'La descripción es obligatoria.' })
  descripcion!: string;

  @ApiProperty({ example: 1.25 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'El precio es obligatorio y debe ser un número con máximo dos decimales.',
    },
  )
  @Min(0.01, { message: 'El precio debe ser mayor a 0.' })
  precio!: number;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'La categoría es obligatoria.' })
  @Min(1, { message: 'La categoría es obligatoria.' })
  categoriaId!: number;

  @ApiProperty({ example: 40 })
  @IsInt({
    message: 'La disponibilidad es obligatoria y debe ser un número entero.',
  })
  @Min(0, { message: 'La disponibilidad no puede ser negativa.' })
  disponibilidad!: number;

  @ApiProperty({ example: '/uploads/platillos/10.png', maxLength: 255 })
  @IsString({ message: 'La imagen debe ser una ruta de texto.' })
  @IsNotEmpty({ message: 'La imagen es obligatoria.' })
  @MaxLength(255, { message: 'La ruta de la imagen es demasiado larga.' })
  imagenUrl!: string;
}
