import { ApiProperty } from '@nestjs/swagger';
import { EstadoItem, EstadoPedido } from '@PrismaClient';

export class ItemListoResponseDto {
  @ApiProperty({ example: 301 })
  itemId!: number;

  @ApiProperty({ enum: EstadoItem, enumName: 'EstadoItem', example: EstadoItem.LISTO })
  estado!: EstadoItem;

  @ApiProperty({
    description: 'Hora local (America/El_Salvador) en que se marcó listo, en HH:mm.',
    example: '12:18',
  })
  listoEn!: string;

  @ApiProperty({
    enum: EstadoPedido,
    enumName: 'EstadoPedido',
    description: 'Estado actual del pedido. Es LISTO solo si este era el último platillo pendiente.',
    example: EstadoPedido.LISTO,
  })
  pedidoEstado!: EstadoPedido;
}
