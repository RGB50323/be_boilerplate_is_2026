import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CrearBeneficioDto {
  @ApiProperty({ example: 'Limonada gratis', maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @ApiPropertyOptional({ example: 'Una limonada con soda', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string | null;

  @ApiProperty({ example: 30, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  costoPuntos!: number;

  @ApiPropertyOptional({ example: true, default: true })
  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsBoolean()
  activo?: boolean;

  @ApiProperty({ example: '2026-11-25T00:00:00.000-06:00' })
  @IsISO8601({ strict: true, strictSeparator: true })
  vigenteDesde!: string;

  @ApiProperty({ example: '2026-12-31T23:59:59.999-06:00' })
  @IsISO8601({ strict: true, strictSeparator: true })
  vigenteHasta!: string;
}

export class EditarBeneficioDto extends PartialType(CrearBeneficioDto, {
  skipNullProperties: false,
}) {}

export class ConfigurarReglaDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  puntosPorDolar!: number;
}

export class AdquirirCuponDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  beneficioId!: number;

  @ApiProperty({
    example: '1f0c2a6e-6a7b-4d0f-9d55-2d3b8b0b5a10',
    description: 'La misma clave en un reintento devuelve el mismo cupón',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  claveIdempotencia!: string;
}
