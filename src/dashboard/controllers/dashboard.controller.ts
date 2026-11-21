import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiProduces,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import {
  DashboardRangoQueryDto,
  DashboardVentasDetalleQueryDto,
  DashboardVentasQueryDto,
  DashboardVentasResponseDto,
  VentasDetalleResponseDto,
} from '@Dashboard/dto';
import { DashboardService } from '@Dashboard/services';
import { Rol, type User } from '@PrismaClient';

@ApiTags('Dashboard')
@ApiBearerAuth()
// RolesGuard es global (app.module.ts): @Roles solo declara quién puede entrar.
@Roles(Rol.GERENTE_GENERAL, Rol.GERENTE)
@ApiForbiddenResponse({
  description:
    'Rol distinto a GERENTE_GENERAL o GERENTE, gerente sin sucursal o gerente que pide otra sucursal.',
})
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('ventas')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Dashboard de ventas por sucursal (H28)',
    description:
      'Gerente general: todas las sucursales o la elegida. Gerente: solo su sucursal. Ventas = subtotal − descuentos, sin IVA ni propina, de pedidos con pago confirmado y sin reembolso. Fechas y horas en hora local de El Salvador.',
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
    @CurrentUser() usuario: User,
  ): Promise<DashboardVentasResponseDto> {
    return this.dashboardService.ventas(
      this.dashboardService.limitarAlcance(query, usuario),
    );
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
    @CurrentUser() usuario: User,
  ): Promise<VentasDetalleResponseDto> {
    return this.dashboardService.ventasDetalle(
      this.dashboardService.limitarAlcance(query, usuario),
    );
  }

  @Get('ventas/exportar')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exportar ventas por sucursal a CSV (H28, criterio 14)',
    description:
      'Una fila por sucursal con Ventas, Pedidos y Ticket promedio, y la fila "Total general". Mismos filtros y cálculos que GET /dashboard/ventas.',
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
    @CurrentUser() usuario: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.dashboardService.exportarVentasPorSucursalCsv(
      this.dashboardService.limitarAlcance(query, usuario),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ventas-por-sucursal_${query.desde}_${query.hasta}.csv"`,
    );
    return csv;
  }
}
