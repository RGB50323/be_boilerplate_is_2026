import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ItemPedidoDto {
  @ApiProperty({ example: 10 })
  @IsInt({ message: 'El platillo es obligatorio.' })
  @Min(1, { message: 'El platillo es obligatorio.' })
  platilloId!: number;

  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt({ message: 'La cantidad debe ser un número entero.' })
  @Min(1, { message: 'La cantidad debe ser al menos 1.' })
  cantidad!: number;

  @ApiPropertyOptional({ example: 'sin curtido', maxLength: 200, nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La nota debe ser texto.' })
  @MaxLength(200, { message: 'La nota no puede superar los 200 caracteres.' })
  nota?: string | null;
}

export class CrearPedidoDto {
  @ApiProperty({ example: 'MESA', enum: ['MESA', 'LLEVAR'] })
  @IsIn(['MESA', 'LLEVAR'], { message: 'El tipo de pedido no es válido.' })
  tipo!: 'MESA' | 'LLEVAR';

  @ApiPropertyOptional({ example: 7, description: 'Obligatorio si tipo es MESA.' })
  @ValidateIf((o: CrearPedidoDto) => o.tipo === 'MESA')
  @IsInt({ message: 'La mesa es obligatoria.' })
  @Min(1, { message: 'La mesa es obligatoria.' })
  mesaId?: number;

  @ApiPropertyOptional({ example: 1, description: 'Obligatorio si tipo es LLEVAR.' })
  @ValidateIf((o: CrearPedidoDto) => o.tipo === 'LLEVAR')
  @IsInt({ message: 'La sucursal es obligatoria.' })
  @Min(1, { message: 'La sucursal es obligatoria.' })
  sucursalId?: number;

  @ApiPropertyOptional({
    example: 'Ana López',
    maxLength: 120,
    description: 'Obligatorio si tipo es LLEVAR (nombre y apellido).',
  })
  @ValidateIf((o: CrearPedidoDto) => o.tipo === 'LLEVAR')
  @Transform(recortar)
  @IsString({ message: 'Ingresa tu nombre completo.' })
  @Matches(/^\S+(\s+\S+)+$/, { message: 'Ingresa tu nombre completo.' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres.' })
  nombreCliente?: string;

  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray({ message: 'Los platillos deben enviarse como una lista.' })
  @ArrayNotEmpty({ message: 'El pedido debe tener al menos un platillo.' })
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items!: ItemPedidoDto[];
}