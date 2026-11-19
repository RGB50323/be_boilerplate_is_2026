import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
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
import { Rol, type User } from '@PrismaClient';
import {
  ModeracionQueryDto,
  ModeracionResenasResponseDto,
  OcultarResenaDto,
  ResenaModeracionDto,
} from '../dto/index.js';
import { ModeracionResenasService } from '../services/index.js';

@ApiTags('Reseñas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'El rol no es GERENTE o la reseña es de otra sucursal',
})
@Roles(Rol.GERENTE)
@Controller('resenas')
export class ModeracionResenasController {
  constructor(private readonly service: ModeracionResenasService) {}

  @Get('moderacion')
  @ApiOperation({
    summary: 'Reseñas de mi sucursal para moderar',
    description:
      'De la más reciente a la más antigua, 10 por página. Filtro opcional por estado (VISIBLE u OCULTA). Las ocultas traen quién, cuándo y por qué.',
  })
  @ApiOkResponse({ type: ModeracionResenasResponseDto })
  @ApiBadRequestResponse({ description: 'Página o estado inválidos' })
  listar(
    @CurrentUser() usuario: User,
    @Query() query: ModeracionQueryDto,
  ): Promise<ModeracionResenasResponseDto> {
    return this.service.listar(usuario, query);
  }

  @Patch(':id/ocultar')
  @ApiOperation({
    summary: 'Ocultar una reseña visible de mi sucursal',
    description:
      'Deja de mostrarse a los clientes y de contar en el promedio. Guarda quién la ocultó, cuándo y el motivo.',
  })
  @ApiOkResponse({ type: ResenaModeracionDto })
  @ApiBadRequestResponse({ description: 'Falta el motivo o no es válido' })
  @ApiNotFoundResponse({ description: 'La reseña no existe' })
  @ApiConflictResponse({ description: 'Esta reseña ya estaba oculta.' })
  ocultar(
    @CurrentUser() usuario: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OcultarResenaDto,
  ): Promise<ResenaModeracionDto> {
    return this.service.ocultar(usuario, id, dto.motivo);
  }
}
