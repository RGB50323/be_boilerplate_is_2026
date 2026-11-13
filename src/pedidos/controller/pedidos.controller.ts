import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import {
  AgregarItemsDto,
  CambiarItemDto,
  CrearPedidoDto,
  ItemsAgregadosResponseDto,
  PedidoCreadoResponseDto,
  PedidoTotalResponseDto,
} from '../dto/index.js';
import { PedidosService } from '../services/pedidos.service.js';

@ApiTags('Pedidos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'Rol distinto a MESERO o mesa/pedido de otra sucursal',
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

  @Post(':id/items')
  @ApiOperation({
    summary: 'Agregar platillos a un pedido abierto (llegan a cocina como nuevos)',
  })
  @ApiCreatedResponse({ type: ItemsAgregadosResponseDto })
  @ApiNotFoundResponse({ description: 'El pedido o un platillo no existe' })
  @ApiConflictResponse({ description: 'El pedido está cerrado' })
  @ApiUnprocessableEntityResponse({
    description: 'Platillo deshabilitado o sin disponibilidad suficiente',
  })
  agregarItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarItemsDto,
    @CurrentUser() usuario: User,
  ): Promise<ItemsAgregadosResponseDto> {
    return this.service.agregarItems(id, dto, usuario);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Cambiar la cantidad o la nota de un platillo' })
  @ApiOkResponse({ type: PedidoTotalResponseDto })
  @ApiBadRequestResponse({ description: 'Cantidad o nota inválida' })
  @ApiNotFoundResponse({ description: 'El pedido o el platillo no existe' })
  @ApiConflictResponse({
    description: 'El platillo ya está listo o el pedido está cerrado',
  })
  @ApiUnprocessableEntityResponse({ description: 'Sin disponibilidad' })
  cambiarItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: CambiarItemDto,
    @CurrentUser() usuario: User,
  ): Promise<PedidoTotalResponseDto> {
    return this.service.cambiarItem(id, itemId, dto, usuario);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Quitar un platillo de un pedido abierto' })
  @ApiOkResponse({ type: PedidoTotalResponseDto })
  @ApiNotFoundResponse({ description: 'El pedido o el platillo no existe' })
  @ApiConflictResponse({
    description:
      'El platillo ya está listo, el pedido está cerrado o quedaría vacío',
  })
  quitarItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() usuario: User,
  ): Promise<PedidoTotalResponseDto> {
    return this.service.quitarItem(id, itemId, usuario);
  }
}