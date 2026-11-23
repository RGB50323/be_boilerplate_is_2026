import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { ItemEntregadoResponseDto, ItemPorEntregarDto } from '@Mesero/dto';
import { EntregasService } from '@Mesero/services';
import { Rol, type User } from '@PrismaClient';

@ApiTags('mesero')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Roles(Rol.MESERO)
@Controller('mesero')
export class MeseroController {
  constructor(private readonly entregasService: EntregasService) {}

  @Get('pedidos-pendientes-de-cobro')
  @ApiOperation({
    summary: 'Lista el último pedido de cada mesa de la sucursal y sus acciones de cobro',
  })
  listarPedidosPendientesDeCobro(@CurrentUser() user: User) {
    return this.entregasService.listarPedidosPendientesDeCobro(user);
  }

  @Get('items-listos')
  @ApiOperation({
    summary: 'Lista los platillos listos por entregar en las mesas de la sucursal',
    description: 'Solo pedidos de mesa de la sucursal del usuario, del que se marcó listo primero al último.',
  })
  @ApiOkResponse({ type: ItemPorEntregarDto, isArray: true })
  @ApiForbiddenResponse({
    description: 'El rol no es MESERO o el usuario no tiene sucursal asignada.',
  })
  listarItemsListos(@CurrentUser() user: User): Promise<ItemPorEntregarDto[]> {
    return this.entregasService.listarItemsListos(user);
  }

  @Patch('items/:itemId/entregado')
  @ApiOperation({
    summary: 'Marca un platillo como entregado en la mesa',
    description:
      'Registra la hora y el mesero que entregó. Si era el último platillo por entregar, el pedido ' +
      'pasa a ENTREGADO y se publica `pedido:entregado` en el namespace /cocina después del commit.',
  })
  @ApiOkResponse({ type: ItemEntregadoResponseDto })
  @ApiBadRequestResponse({ description: 'itemId no es un entero.' })
  @ApiForbiddenResponse({
    description:
      'El rol no es MESERO, el usuario no tiene sucursal o el platillo es de otra sucursal.',
  })
  @ApiNotFoundResponse({ description: 'El platillo del pedido no existe.' })
  @ApiConflictResponse({
    description:
      'El platillo ya fue entregado (incluido el segundo de dos marcados simultáneos) o el pedido está cancelado.',
  })
  @ApiUnprocessableEntityResponse({ description: 'El platillo todavía no está listo.' })
  marcarEntregado(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: User,
  ): Promise<ItemEntregadoResponseDto> {
    return this.entregasService.marcarEntregado(itemId, user);
  }
}
