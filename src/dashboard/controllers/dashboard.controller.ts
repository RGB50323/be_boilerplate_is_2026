import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import {
  DashboardVentasQueryDto,
  DashboardVentasResponseDto,
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
}
