import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsIn,
  IsDefined,
  IsObject,
  ValidateIf,
  Matches,
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
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ItemTicketDto)
  items!: ItemTicketDto[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total!: number;
}

export class ProcesarPagoDto {
  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsIn(['EFECTIVO', 'TARJETA'])
  metodo?: 'EFECTIVO' | 'TARJETA';

  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  montoRecibido?: string;

  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsString()
  @Matches(/^[A-Z][A-Z ]{0,19}$/)
  marca?: string;

  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsString()
  @Matches(/^\d{4}$/)
  ultimosCuatro?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  solicitudId!: string;

  @ValidateNested()
  @IsDefined()
  @IsObject()
  @Type(() => TicketPagoDto)
  ticket!: TicketPagoDto;
}
