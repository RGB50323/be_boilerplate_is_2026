import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { ProcesarPagoDto } from '@Pagos/dto';
import { PagosService } from '@Pagos/services';
import { CambiarEstadoPagoDto } from '../dto/cambiar-estado-pago.dto.js';

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Post('procesar')
  @Roles(Rol.CLIENTE, Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  async procesarPago(
    @Body() datos: ProcesarPagoDto,
    @CurrentUser() usuario: User,
  ) {
    return this.pagosService.procesarPago(datos, usuario);
  }

  @Get('pedido/:pedidoId')
  @Roles(Rol.CLIENTE, Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  consultarPorPedido(
    @Param('pedidoId', ParseIntPipe) pedidoId: number,
    @CurrentUser() usuario: User,
  ) {
    return this.pagosService.consultarPorPedido(pedidoId, usuario);
  }

  @Get('transaccion/:transaccionId')
  @Roles(Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  async consultarTransaccion(
    @Param('transaccionId') transaccionId: string,
    @CurrentUser() usuario: User,
  ) {
    return this.pagosService.consultarTransaccion(transaccionId, usuario);
  }

  @Patch('transaccion/:transaccionId/estado')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  async cambiarEstado(
    @Param('transaccionId') transaccionId: string,
    @Body() datos: CambiarEstadoPagoDto,
    @CurrentUser() usuario: User,
  ) {
    return this.pagosService.cambiarEstadoTransaccion(
      transaccionId,
      datos.estado,
      usuario,
    );
  }
}
