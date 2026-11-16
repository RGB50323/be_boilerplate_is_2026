import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Recorta espacios; un comentario vacío se guarda como null
const comentarioLimpio = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const limpio = value.trim();
  return limpio.length === 0 ? null : limpio;
};

export class PublicarResenaDto {
  @ApiProperty({ example: 121 })
  @IsInt({ message: 'El pedido es obligatorio.' })
  @Min(1, { message: 'El pedido es obligatorio.' })
  pedidoId!: number;

  @ApiProperty({ example: 10 })
  @IsInt({ message: 'El platillo es obligatorio.' })
  @Min(1, { message: 'El platillo es obligatorio.' })
  platilloId!: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt({ message: 'La calificación debe ser de 1 a 5 estrellas.' })
  @Min(1, { message: 'La calificación debe ser de 1 a 5 estrellas.' })
  @Max(5, { message: 'La calificación debe ser de 1 a 5 estrellas.' })
  estrellas!: number;

  @ApiPropertyOptional({
    example: 'Las pupusas estaban increíbles',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(comentarioLimpio)
  @IsString({ message: 'El comentario debe ser texto.' })
  @MaxLength(500, {
    message: 'El comentario no puede superar los 500 caracteres.',
  })
  comentario?: string | null;
}
