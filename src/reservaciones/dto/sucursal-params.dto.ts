import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class SucursalParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'id de sucursal debe ser un número entero.' })
  @Min(1, { message: 'id de sucursal debe ser mayor que 0.' })
  @Max(2147483647, { message: 'id de sucursal excede el máximo permitido.' })
  id!: number;
}
