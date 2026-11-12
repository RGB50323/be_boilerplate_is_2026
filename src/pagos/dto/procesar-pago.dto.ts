import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ItemTicketDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_unitario!: number;

  @IsInt()
  @Min(1)
  cantidad!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal!: number;
}

export class TicketPagoDto {
  @IsInt()
  @Min(1)
  id!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemTicketDto)
  items!: ItemTicketDto[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total!: number;
}

export class ProcesarPagoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  solicitudId!: string;

  @ValidateNested()
  @Type(() => TicketPagoDto)
  ticket!: TicketPagoDto;
}
