import { ApiProperty } from '@nestjs/swagger';

export class VentasSucursalDto {
  @ApiProperty({ example: 1 })
  sucursalId!: number;

  @ApiProperty({ example: 'Centro' })
  nombre!: string;

  @ApiProperty({
    description:
      'Subtotal menos descuentos, sin IVA ni propina, de los pedidos con pago confirmado y sin reembolso.',
    example: 8120,
  })
  ventas!: number;

  @ApiProperty({ example: 640 })
  pedidos!: number;

  @ApiProperty({
    description:
      'Ventas ÷ pedidos, redondeado a dos decimales; 0 si la sucursal no tuvo pedidos.',
    example: 12.69,
  })
  ticketPromedio!: number;
}

export class TotalGeneralDto {
  @ApiProperty({
    description: 'Suma de las ventas de las sucursales de la respuesta.',
    example: 15230.5,
  })
  ventas!: number;

  @ApiProperty({ example: 1180 })
  pedidos!: number;

  @ApiProperty({
    description: 'Ventas totales ÷ pedidos totales, a dos decimales; 0 sin pedidos.',
    example: 12.91,
  })
  ticketPromedio!: number;
}

export class PlatilloVendidoDto {
  @ApiProperty({ example: 4 })
  platilloId!: number;

  @ApiProperty({ example: 'Hamburguesa' })
  nombre!: string;

  @ApiProperty({ example: 120 })
  cantidad!: number;

  @ApiProperty({
    description:
      'Cantidad × precio unitario de las líneas del pedido (antes de descuentos del pedido).',
    example: 1078.8,
  })
  monto!: number;
}

export class FranjaHorariaDto {
  @ApiProperty({
    description: 'Hora local de inicio de la franja de 1 hora (12 = 12:00 a 13:00).',
    minimum: 0,
    maximum: 23,
    example: 12,
  })
  hora!: number;

  @ApiProperty({ example: 1543.25 })
  ventas!: number;
}

export class HorarioPicoSucursalDto {
  @ApiProperty({ example: 1 })
  sucursalId!: number;

  @ApiProperty({ example: 'Centro' })
  nombre!: string;

  @ApiProperty({
    type: FranjaHorariaDto,
    isArray: true,
    description:
      'Franjas desde la apertura hasta el cierre (y cualquier hora con ventas fuera de ese rango), ordenadas por hora.',
  })
  franjas!: FranjaHorariaDto[];
}

export class DashboardVentasResponseDto {
  @ApiProperty({ example: '2026-11-01' })
  desde!: string;

  @ApiProperty({ example: '2026-11-30' })
  hasta!: string;

  @ApiProperty({
    type: VentasSucursalDto,
    isArray: true,
    description: 'Todas las sucursales de la selección, incluso sin ventas.',
  })
  sucursales!: VentasSucursalDto[];

  @ApiProperty({
    type: TotalGeneralDto,
    description: 'Totales de las sucursales incluidas (todas o la filtrada).',
  })
  totalGeneral!: TotalGeneralDto;

  @ApiProperty({
    type: PlatilloVendidoDto,
    isArray: true,
    description:
      'Todos los platillos vendidos, de mayor a menor cantidad; en empate, primero el de mayor monto.',
  })
  platillos!: PlatilloVendidoDto[];

  @ApiProperty({ type: HorarioPicoSucursalDto, isArray: true })
  horariosPico!: HorarioPicoSucursalDto[];
}
