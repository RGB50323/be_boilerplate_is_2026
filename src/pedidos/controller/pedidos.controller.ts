import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { CrearPedidoDto, PedidoCreadoResponseDto } from '../dto/index.js';
import { PedidosService } from '../services/pedidos.service.js';

@ApiTags('Pedidos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'Rol distinto a MESERO o mesa de otra sucursal',
})
@Roles(Rol.MESERO)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly service: PedidosService) { }

  @Post()
  @ApiOperation({
    summary: 'Registrar el pedido de una mesa y enviarlo a cocina',
  })
  @ApiCreatedResponse({ type: PedidoCreadoResponseDto })
  @ApiNotFoundResponse({ description: 'La mesa o un platillo no existe' })
  @ApiConflictResponse({ description: 'La mesa ya tiene un pedido abierto' })
  @ApiUnprocessableEntityResponse({
    description: 'Platillo deshabilitado o sin disponibilidad suficiente',
  })
  crear(
    @Body() dto: CrearPedidoDto,
    @CurrentUser() usuario: User,
  ): Promise<PedidoCreadoResponseDto> {
    return this.service.crear(dto, usuario);
  }
}