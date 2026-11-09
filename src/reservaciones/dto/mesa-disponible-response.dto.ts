import { ApiProperty } from '@nestjs/swagger';

export class MesaDisponibleResponseDto {
  @ApiProperty({ example: 3 })
  mesaId!: number;

  @ApiProperty({ example: 3 })
  numero!: number;

  @ApiProperty({ example: 4 })
  capacidad!: number;

  @ApiProperty({ type: String, nullable: true, example: 'Terraza' })
  zona!: string | null;
}
