import { ApiProperty } from '@nestjs/swagger';

export class MovimientoRegistradoResponseDto {
  @ApiProperty({ example: 88 })
  movimientoId!: number;

  @ApiProperty({ example: 12.5 })
  cantidadAnterior!: number;

  @ApiProperty({ example: 9.5 })
  cantidadActual!: number;
}
