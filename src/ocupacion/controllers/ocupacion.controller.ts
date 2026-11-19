import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { SucursalParamsDto } from '@Reservaciones/dto';
import {
  OcupacionQueryDto,
  OcupacionResponseDto,
} from '../dto/ocupacion.dto.js';
import { OcupacionService } from '../services/ocupacion.service.js';

@ApiTags('ocupación')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'El rol no es GERENTE o no administra esa sucursal',
})
@ApiNotFoundResponse({ description: 'Sucursal no encontrada' })
@ApiBadRequestResponse({ description: 'Fecha o parámetro inválido' })
@Roles(Rol.GERENTE)
@Controller('sucursales/:id/ocupacion')
export class OcupacionController {
  constructor(private readonly service: OcupacionService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Ocupación proyectada por hora de la sucursal administrada',
  })
  @ApiOkResponse({
    type: OcupacionResponseDto,
    description:
      'Bloques horarios con cantidad de mesas reservadas, disponibles y porcentaje de ocupación',
  })
  consultar(
    @Param() params: SucursalParamsDto,
    @Query() query: OcupacionQueryDto,
    @CurrentUser() usuario: User,
  ): Promise<OcupacionResponseDto> {
    return this.service.consultar(params.id, query.fecha, usuario);
  }
}
