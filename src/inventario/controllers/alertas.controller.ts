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
import { AlertaInsumoResponseDto } from '@Inventario/dto';
import { AlertasService } from '@Inventario/services';
import { Rol, type User } from '@PrismaClient';

@ApiTags('inventario')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Roles(Rol.GERENTE)
@Controller('inventario/alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las alertas sin resolver de la sucursal del gerente',
    description:
      'Solo alertas ACTIVA y VISTA, de la más reciente a la más antigua. ' +
      'Una alerta se crea cuando un movimiento deja la cantidad en el mínimo o por debajo, ' +
      'y se resuelve sola cuando una entrada la deja por encima.',
  })
  @ApiOkResponse({ type: AlertaInsumoResponseDto, isArray: true })
  @ApiForbiddenResponse({
    description: 'El rol no es GERENTE o el usuario no tiene sucursal asignada.',
  })
  listar(@CurrentUser() user: User): Promise<AlertaInsumoResponseDto[]> {
    return this.alertasService.listar(user);
  }

  @Patch(':id/vista')
  @ApiOperation({
    summary: 'Marca una alerta como vista',
    description:
      'Pasa de ACTIVA a VISTA y guarda la hora. Si ya estaba VISTA responde 200 sin cambios. ' +
      'La alerta sigue en la lista hasta que se resuelve.',
  })
  @ApiOkResponse({ type: AlertaInsumoResponseDto })
  @ApiBadRequestResponse({ description: 'id no es un entero.' })
  @ApiForbiddenResponse({
    description:
      'El rol no es GERENTE, el usuario no tiene sucursal o la alerta es de otra sucursal.',
  })
  @ApiNotFoundResponse({ description: 'La alerta no existe.' })
  @ApiConflictResponse({ description: 'La alerta ya está resuelta.' })
  marcarVista(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<AlertaInsumoResponseDto> {
    return this.alertasService.marcarVista(id, user);
  }
}
