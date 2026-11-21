import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import {
  ReporteResenasQueryDto,
  ReporteResenasResponseDto,
} from '../dto/index.js';
import { ReporteResenasService } from '../services/index.js';

@ApiTags('Reseñas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'El rol no es GERENTE o no tiene sucursal asignada',
})
@Roles(Rol.GERENTE)
@Controller('resenas')
export class ReporteResenasController {
  constructor(private readonly service: ReporteResenasService) {}

  @Get('reporte')
  @ApiOperation({
    summary: 'Promedio, total y distribución de reseñas de mi sucursal',
    description:
      'Solo reseñas visibles. Con desde/hasta (fechas locales, inclusive) se filtra por fecha de publicación.',
  })
  @ApiOkResponse({ type: ReporteResenasResponseDto })
  @ApiBadRequestResponse({
    description: 'Fechas inválidas o la final es anterior a la inicial',
  })
  reporte(
    @CurrentUser() usuario: User,
    @Query() query: ReporteResenasQueryDto,
  ): Promise<ReporteResenasResponseDto> {
    return this.service.reporte(usuario.sucursalId, query);
  }
}
