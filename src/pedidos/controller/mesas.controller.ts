import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { MesaResponseDto } from '../dto/index.js';
import { PedidosService } from '../services/pedidos.service.js';

@ApiTags('Mesas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'Rol distinto a MESERO o sucursal distinta a la del usuario',
})
@Roles(Rol.MESERO)
@Controller('sucursales/:sucursalId/mesas')
export class MesasController {
  constructor(private readonly service: PedidosService) { }

  @Get()
  @ApiOperation({
    summary: 'Listar las mesas de la sucursal con su pedido abierto',
  })
  @ApiOkResponse({ type: [MesaResponseDto] })
  listar(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @CurrentUser() usuario: User,
  ): Promise<MesaResponseDto[]> {
    return this.service.listarMesas(sucursalId, usuario);
  }
}