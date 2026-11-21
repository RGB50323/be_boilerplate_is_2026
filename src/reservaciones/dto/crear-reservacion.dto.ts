import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConsultarDisponibilidadDto } from './consultar-disponibilidad.dto.js';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearReservacionDto extends ConsultarDisponibilidadDto {
  @ApiProperty({ example: 3, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Seleccioná una mesa válida.' })
  @Min(1)
  @Max(2147483647)
  mesaId!: number;

  @ApiProperty({ example: 'Ana López', maxLength: 120 })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ingresá tu nombre completo.' })
  @MaxLength(120, { message: 'El nombre admite hasta 120 caracteres.' })
  nombre!: string;

  @ApiProperty({ example: '7123-4567' })
  @Transform(recortar)
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'Ingresá un teléfono con formato ####-####.',
  })
  telefono!: string;

  @ApiProperty({ example: 'ana@correo.com', maxLength: 160 })
  @Transform(recortar)
  @IsEmail({}, { message: 'Ingresá un correo electrónico válido.' })
  @MaxLength(160, { message: 'El correo admite hasta 160 caracteres.' })
  correo!: string;
}
