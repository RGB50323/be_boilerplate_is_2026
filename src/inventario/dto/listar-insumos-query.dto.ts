import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListarInsumosQueryDto {
  @ApiPropertyOptional({
    description: 'Parte del nombre del insumo, sin distinguir mayúsculas',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La búsqueda debe ser texto.' })
  @MaxLength(100, {
    message: 'La búsqueda no puede superar los 100 caracteres.',
  })
  q?: string;
}
