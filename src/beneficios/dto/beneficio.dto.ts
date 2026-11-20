import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginacionQueryDto } from '@Common/paginacion';

export const ID_MAXIMO = 2_147_483_647;

export enum EstadoBeneficio {
  PROGRAMADO = 'PROGRAMADO',
  VIGENTE = 'VIGENTE',
  VENCIDO = 'VENCIDO',
  DESHABILITADO = 'DESHABILITADO',
  SIN_PLATILLO = 'SIN_PLATILLO',
}

export class CrearBeneficioDto {
  @ApiProperty({ example: 15, minimum: 1, maximum: ID_MAXIMO })
  @IsInt()
  @Min(1)
  @Max(ID_MAXIMO)
  platilloId!: number;

  @ApiProperty({ example: 150, minimum: 1, maximum: ID_MAXIMO })
  @IsInt()
  @Min(1)
  @Max(ID_MAXIMO)
  costoPuntos!: number;

  @ApiProperty({ example: '2026-11-25', format: 'date' })
  @Length(10, 10)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  vigenteDesde!: string;

  @ApiProperty({ example: '2026-11-30', format: 'date' })
  @Length(10, 10)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  vigenteHasta!: string;
}

export class EditarBeneficioDto extends PartialType(CrearBeneficioDto, {
  skipNullProperties: false,
}) {}

export class ListarBeneficiosDto extends PaginacionQueryDto {
  @ApiPropertyOptional({ enum: EstadoBeneficio })
  @ValidateIf((_, valor) => valor !== undefined)
  @IsEnum(EstadoBeneficio)
  estado?: EstadoBeneficio;
}

export class ListarPlatillosBeneficioDto extends PaginacionQueryDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf((_, valor) => valor !== undefined)
  @MaxLength(120)
  buscar?: string;
}
