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
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { ROLES_COCINA } from '@Cocina/constants';
import { ItemListoResponseDto, PedidoCocinaDto } from '@Cocina/dto';
import { CocinaItemsService, CocinaService } from '@Cocina/services';
import { Rol, type User } from '@PrismaClient';

@ApiTags('cocina')
@ApiBearerAuth()
@Controller('cocina')
export class CocinaController {
  constructor(
    private readonly cocinaService: CocinaService,
    private readonly cocinaItemsService: CocinaItemsService,
  ) {}

  @Get('pedidos')
  @Roles(...ROLES_COCINA)
  @ApiOperation({ summary: 'Lista los pedidos pendientes de cocina, del más antiguo al más reciente' })
  @ApiOkResponse({ type: PedidoCocinaDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
  @ApiForbiddenResponse({
    description: 'El rol no tiene acceso a cocina o el usuario no tiene sucursal asignada.',
  })
  listarPendientes(@CurrentUser() user: User): Promise<PedidoCocinaDto[]> {
    return this.cocinaService.listarPendientes(user);
  }

  @Patch('items/:itemId/listo')
  @Roles(Rol.COCINA, Rol.GERENTE)
  @ApiOperation({
    summary: 'Marca un platillo del pedido como listo',
    description:
      'Si era el último platillo pendiente, el pedido pasa a LISTO. Publica `item:listo` ' +
      '(y `pedido:listo` si el pedido se completó) en el namespace /cocina después del commit.',
  })
  @ApiOkResponse({ type: ItemListoResponseDto })
  @ApiBadRequestResponse({ description: 'itemId no es un entero.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
  @ApiForbiddenResponse({
    description:
      'El rol no es COCINA ni GERENTE, el usuario no tiene sucursal o el platillo es de otra sucursal.',
  })
  @ApiNotFoundResponse({ description: 'El platillo del pedido no existe.' })
  @ApiConflictResponse({
    description: 'El platillo ya está listo (incluido el segundo de dos marcados simultáneos) o el pedido no está en cocina.',
  })
  marcarListo(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: User,
  ): Promise<ItemListoResponseDto> {
    return this.cocinaItemsService.marcarListo(itemId, user);
  }
}
