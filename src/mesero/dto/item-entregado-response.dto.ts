import { ApiProperty } from '@nestjs/swagger';
import { EstadoItem, EstadoPedido } from '@PrismaClient';

export class ItemEntregadoResponseDto {
  @ApiProperty({ example: 301 })
  itemId!: number;

  @ApiProperty({ enum: EstadoItem, enumName: 'EstadoItem', example: EstadoItem.ENTREGADO })
  estado!: EstadoItem;

  @ApiProperty({
    description: 'Hora local (America/El_Salvador) de la entrega, en HH:mm.',
    example: '12:25',
  })
  entregadoEn!: string;

  @ApiProperty({
    enum: EstadoPedido,
    enumName: 'EstadoPedido',
    description: 'Estado actual del pedido. Es ENTREGADO solo si este era el último platillo por entregar.',
    example: EstadoPedido.ENTREGADO,
  })
  pedidoEstado!: EstadoPedido;
}
