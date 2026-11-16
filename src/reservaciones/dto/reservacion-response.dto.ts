import { ApiProperty } from '@nestjs/swagger';

export class ReservacionResponseDto {
  @ApiProperty({ example: 'R-000045' }) reservacionId!: string;
  @ApiProperty({ enum: ['CONFIRMADA', 'CANCELADA'] }) estado!:
    'CONFIRMADA' | 'CANCELADA';
  @ApiProperty() mesaId!: number;
  @ApiProperty({ description: 'Número visible de la mesa.' }) mesa!: number;
  @ApiProperty() sucursalId!: number;
  @ApiProperty() sucursal!: string;
  @ApiProperty({ example: '2026-11-20' }) fecha!: string;
  @ApiProperty({ example: '19:00' }) hora!: string;
  @ApiProperty() personas!: number;
}

export class MisReservacionesResponseDto {
  @ApiProperty({ type: [ReservacionResponseDto] })
  datos!: ReservacionResponseDto[];
  @ApiProperty() pagina!: number;
  @ApiProperty() totalPaginas!: number;
  @ApiProperty() total!: number;
}
