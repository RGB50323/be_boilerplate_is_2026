import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CambiarItemDto {
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @ValidateIf((_objeto, valor) => valor !== undefined)
  @IsInt({ message: 'La cantidad debe ser un número entero.' })
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  cantidad?: number;

  @ApiPropertyOptional({
    example: 'sin cebolla',
    maxLength: 200,
    nullable: true,
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(200, { message: 'La nota no puede superar los 200 caracteres.' })
  nota?: string | null;
}