import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiProduces,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import {
  DashboardRangoQueryDto,
  DashboardVentasDetalleQueryDto,
  DashboardVentasQueryDto,
  DashboardVentasResponseDto,
  VentasDetalleResponseDto,
} from '@Dashboard/dto';
import { DashboardService } from '@Dashboard/services';
import { Rol } from '@PrismaClient';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Roles(Rol.GERENTE_GENERAL)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('ventas')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Dashboard de ventas por sucursal (H28)',
    description:
      'Solo para el gerente general. Ventas = subtotal − descuentos, sin IVA ni propina, de pedidos con pago confirmado y sin reembolso. Fechas y horas en hora local de El Salvador.',
  })
  @ApiOkResponse({ type: DashboardVentasResponseDto })
  @ApiBadRequestResponse({
    description:
      'Fechas inválidas, fecha final anterior a la inicial o parámetros no permitidos.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'La sucursal solicitada no existe.' })
  ventas(
    @Query() query: DashboardVentasQueryDto,
  ): Promise<DashboardVentasResponseDto> {
    return this.dashboardService.ventas(query);
  }

  @Get('ventas/detalle')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Ventas confirmadas, una por pedido (H28)',
    description:
      'Lista paginada de pedidos con pago confirmado y sin reembolso, de la más reciente a la más antigua. Mismas reglas y fechas que GET /dashboard/ventas.',
  })
  @ApiOkResponse({ type: VentasDetalleResponseDto })
  @ApiBadRequestResponse({
    description: 'Fechas inválidas, rango invertido o paginación fuera de rango.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'La sucursal solicitada no existe.' })
  ventasDetalle(
    @Query() query: DashboardVentasDetalleQueryDto,
  ): Promise<VentasDetalleResponseDto> {
    return this.dashboardService.ventasDetalle(query);
  }

  @Get('ventas/exportar')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exportar ventas confirmadas a CSV (H28, criterio 14)',
    description:
      'Todas las ventas confirmadas del periodo. Columnas: Fecha, Hora, Pedido, Sucursal, Tipo, Artículos, Subtotal, Descuentos, Venta (hora de El Salvador).',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV.', schema: { type: 'string' } })
  @ApiBadRequestResponse({ description: 'Fechas inválidas o rango invertido.' })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'La sucursal solicitada no existe.' })
  async exportarVentas(
    @Query() query: DashboardRangoQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.dashboardService.exportarVentasCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ventas-confirmadas_${query.desde}_${query.hasta}.csv"`,
    );
    return csv;
  }
}
