import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { ROLES_COCINA } from '@Cocina/constants';
import { PedidoCocinaDto } from '@Cocina/dto';
import { CocinaService } from '@Cocina/services';
import type { User } from '@PrismaClient';

@ApiTags('cocina')
@ApiBearerAuth()
@Controller('cocina')
export class CocinaController {
  constructor(private readonly cocinaService: CocinaService) {}

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
}
