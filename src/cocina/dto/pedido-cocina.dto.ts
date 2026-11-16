import { ApiProperty } from '@nestjs/swagger';
import { EstadoItem, TipoPedido } from '@PrismaClient';
import type { PedidoCocina } from '@Cocina/repositories';

const MILISEGUNDOS_POR_MINUTO = 60_000;

export class ItemCocinaDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ description: 'Nombre del platillo.', example: 'Pupusa revuelta' })
  platillo!: string;

  @ApiProperty({ example: 2 })
  cantidad!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Especificaciones del cliente.',
    example: 'Sin curtido',
  })
  nota!: string | null;

  @ApiProperty({ enum: EstadoItem, enumName: 'EstadoItem' })
  estado!: EstadoItem;
}

export class PedidoCocinaDto {
  @ApiProperty({ example: 41 })
  id!: number;

  @ApiProperty({ type: String, nullable: true, example: 'C-0041' })
  numero!: string | null;

  @ApiProperty({ enum: TipoPedido, enumName: 'TipoPedido' })
  tipo!: TipoPedido;

  @ApiProperty({ description: '"Mesa N" o "Para llevar".', example: 'Mesa 3' })
  destino!: string;

  @ApiProperty({ type: Number, nullable: true, example: 3 })
  mesaNumero!: number | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Hora de llegada del pedido, en ISO 8601.',
  })
  creadoEn!: string;

  @ApiProperty({
    description: 'Minutos completos de espera, calculados por el servidor al responder.',
    example: 7,
  })
  minutosEspera!: number;

  @ApiProperty({ description: 'true si minutosEspera supera COCINA_MINUTOS_RETRASO.' })
  retrasado!: boolean;

  @ApiProperty({ type: [ItemCocinaDto] })
  items!: ItemCocinaDto[];

  static fromEntity(
    pedido: PedidoCocina,
    minutosRetraso: number,
    ahora: Date,
  ): PedidoCocinaDto {
    const minutosEspera = Math.max(
      0,
      Math.floor((ahora.getTime() - pedido.creadoEn.getTime()) / MILISEGUNDOS_POR_MINUTO),
    );
    const mesaNumero = pedido.mesa?.numero ?? null;

    return {
      id: pedido.id,
      numero: pedido.numero,
      tipo: pedido.tipo,
      destino: PedidoCocinaDto.destino(pedido.tipo, mesaNumero),
      mesaNumero,
      creadoEn: pedido.creadoEn.toISOString(),
      minutosEspera,
      retrasado: minutosEspera > minutosRetraso,
      items: pedido.detalles.map((detalle) => ({
        id: detalle.id,
        platillo: detalle.platillo.nombre,
        cantidad: detalle.cantidad,
        nota: detalle.nota,
        estado: detalle.estado,
      })),
    };
  }

  private static destino(tipo: TipoPedido, mesaNumero: number | null): string {
    if (tipo === TipoPedido.LLEVAR) return 'Para llevar';
    return mesaNumero === null ? 'Mesa sin asignar' : `Mesa ${mesaNumero}`;
  }
}
