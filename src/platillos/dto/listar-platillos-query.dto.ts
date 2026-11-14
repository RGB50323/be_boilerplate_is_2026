import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionQueryDto } from '@Common/paginacion';

export class ListarPlatillosQueryDto extends PaginacionQueryDto {
  @ApiPropertyOptional({
    description: 'Texto a buscar en el nombre del platillo',
    maxLength: 120,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'La búsqueda debe ser texto.' })
  @MaxLength(120, {
    message: 'La búsqueda no puede superar los 120 caracteres.',
  })
  q?: string;
}