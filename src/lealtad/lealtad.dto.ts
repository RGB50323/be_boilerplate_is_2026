import { PartialType } from '@nestjs/swagger';
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string | null;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  costoPuntos!: number;

  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsBoolean()
  activo?: boolean;

  @IsISO8601({ strict: true, strictSeparator: true })
  vigenteDesde!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  vigenteHasta!: string;
}

export class EditarBeneficioDto extends PartialType(CrearBeneficioDto, {
  skipNullProperties: false,
}) {}

export class ConfigurarReglaDto {
  @IsInt()
  @Min(1)
  @Max(10)
  puntosPorDolar!: number;
}

export class AdquirirCuponDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  beneficioId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  claveIdempotencia!: string;
}
