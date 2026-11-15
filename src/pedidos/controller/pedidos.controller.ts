import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
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
  PedidoCanceladoResponseDto,
  PedidoCreadoResponseDto,
  PedidoDetalleResponseDto,
  PedidoLlevarCreadoResponseDto,
  PedidoSeguimientoResponseDto,
  PedidoTotalResponseDto,
} from '../dto/index.js';
import { PedidosService } from '../services/pedidos.service.js';
import { PedidosLlevarService } from '../services/pedidos-llevar.service.js';

@ApiTags('Pedidos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description:
    'Rol no permitido para la operación o mesa/pedido de otra sucursal o de otro cliente',
})
@Roles(Rol.MESERO)
@Controller('pedidos')
export class PedidosController {
  constructor(
    private readonly service: PedidosService,
    private readonly llevar: PedidosLlevarService,
  ) {}

  @Post()
  @Roles(Rol.MESERO, Rol.CLIENTE)
  @ApiOperation({
    summary:
      'MESA (mesero): registra el pedido y lo envía a cocina. LLEVAR (cliente): lo deja pendiente de pago',
  })
  @ApiCreatedResponse({
    description:
      'MESA: PedidoCreado. LLEVAR: { pedidoId, estado: PENDIENTE_PAGO, total }',
    type: PedidoLlevarCreadoResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Sin platillos, sin nombre completo o datos inválidos',
  })
  @ApiNotFoundResponse({
    description: 'La mesa, la sucursal o un platillo no existe',
  })
  @ApiConflictResponse({ description: 'La mesa ya tiene un pedido abierto' })
  @ApiUnprocessableEntityResponse({
    description:
      'Platillo deshabilitado, de otra sucursal o sin disponibilidad suficiente',
  })
  crear(
    @Body() dto: CrearPedidoDto,
    @CurrentUser() usuario: User,
  ): Promise<PedidoCreadoResponseDto | PedidoLlevarCreadoResponseDto> {
    if (dto.tipo === 'LLEVAR') return this.llevar.crear(dto, usuario);
    if (usuario.rol !== Rol.MESERO) {
      throw new ForbiddenException(
        'Solo un mesero puede registrar pedidos de mesa.',
      );
    }
    return this.service.crear(dto, usuario);
  }

  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  @Roles(Rol.CLIENTE)
  @ApiOperation({
    summary:
      'Cancelar un pedido para llevar RECIBIDO: reembolsa el pago y devuelve la disponibilidad',
  })
  @ApiOkResponse({ type: PedidoCanceladoResponseDto })
  @ApiNotFoundResponse({ description: 'El pedido no existe' })
  @ApiConflictResponse({
    description:
      'El pedido ya está en preparación o en un estado distinto de RECIBIDO',
  })
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ): Promise<PedidoCanceladoResponseDto> {
    return this.llevar.cancelar(id, usuario);
  }

  @Get(':id/seguimiento')
  @Roles(Rol.CLIENTE)
  @ApiOperation({
    summary: 'Ver el seguimiento de un pedido para llevar propio',
  })
  @ApiOkResponse({ type: PedidoSeguimientoResponseDto })
  @ApiNotFoundResponse({ description: 'El pedido no existe' })
  seguimiento(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ): Promise<PedidoSeguimientoResponseDto> {
    return this.llevar.obtenerSeguimiento(id, usuario);
  }

  @Post(':id/items')
  @ApiOperation({
    summary:
      'Agregar platillos a un pedido abierto (llegan a cocina como nuevos)',
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

  @Get(':id')
  @ApiOperation({ summary: 'Ver un pedido con sus platillos' })
  @ApiOkResponse({ type: PedidoDetalleResponseDto })
  @ApiNotFoundResponse({ description: 'El pedido no existe' })
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ): Promise<PedidoDetalleResponseDto> {
    return this.service.obtener(id, usuario);
  }
}
