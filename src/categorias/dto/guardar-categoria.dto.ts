import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GuardarCategoriaDto {
  @ApiProperty({ example: 'Típicos', maxLength: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre de la categoría es obligatorio.' })
  @MaxLength(50, { message: 'El nombre no puede superar los 50 caracteres.' })
  nombre!: string;
}
