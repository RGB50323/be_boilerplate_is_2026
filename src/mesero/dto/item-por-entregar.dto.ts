import { ApiProperty } from '@nestjs/swagger';

export class ItemPorEntregarDto {
  @ApiProperty({ example: 301 })
  itemId!: number;

  @ApiProperty({ example: 120 })
  pedidoId!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Número de la mesa.', example: 7 })
  mesa!: number | null;

  @ApiProperty({ example: 'Pupusa revuelta' })
  platillo!: string;

  @ApiProperty({ example: 3 })
  cantidad!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Hora local (America/El_Salvador) en que cocina lo marcó listo, en HH:mm.',
    example: '12:18',
  })
  listoEn!: string | null;
}
