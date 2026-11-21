import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ItemPedidoDto } from './crear-pedido.dto.js';

export class AgregarItemsDto {
  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray({ message: 'Los platillos deben enviarse como una lista.' })
  @ArrayNotEmpty({ message: 'Debes agregar al menos un platillo.' })
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items!: ItemPedidoDto[];
}