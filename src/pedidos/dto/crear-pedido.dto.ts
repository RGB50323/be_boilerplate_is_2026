import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
  @ApiProperty({ example: 'MESA', enum: ['MESA'] })
  @IsIn(['MESA'], { message: 'Solo se admiten pedidos de mesa.' })
  tipo!: 'MESA';

  @ApiProperty({ example: 7 })
  @IsInt({ message: 'La mesa es obligatoria.' })
  @Min(1, { message: 'La mesa es obligatoria.' })
  mesaId!: number;

  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray({ message: 'Los platillos deben enviarse como una lista.' })
  @ArrayNotEmpty({ message: 'El pedido debe tener al menos un platillo.' })
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items!: ItemPedidoDto[];
}