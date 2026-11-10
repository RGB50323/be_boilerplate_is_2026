import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class GuardarPlatilloDto {
  @ApiProperty({ example: 'Pupusa revuelta', maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre del platillo es obligatorio.' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres.' })
  nombre!: string;

  @ApiPropertyOptional({ example: 'Con queso y chicharrón' })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto.' })
  descripcion?: string;

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

  @ApiPropertyOptional({ example: '/img/10.jpg', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'La imagen debe ser una ruta de texto.' })
  @MaxLength(255, { message: 'La ruta de la imagen es demasiado larga.' })
  imagenUrl?: string;
}
