import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
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
  GuardarPlatilloDto,
  PlatilloDeshabilitadoResponseDto,
  PlatilloResponseDto,
} from '../dto/index.js';
import { PlatillosService } from '../services/platillos.service.js';

@ApiTags('Platillos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'Rol distinto a GERENTE o sucursal no administrada',
})
@Roles(Rol.GERENTE)
@Controller()
export class PlatillosController {
  constructor(private readonly service: PlatillosService) {}

  @Get('sucursales/:sucursalId/platillos')
  @ApiOperation({
    summary: 'Listar los platillos de la sucursal (incluye deshabilitados)',
  })
  @ApiOkResponse({ type: [PlatilloResponseDto] })
  listar(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @CurrentUser() usuario: User,
  ): Promise<PlatilloResponseDto[]> {
    return this.service.listar(sucursalId, usuario.sucursalId);
  }

  @Post('sucursales/:sucursalId/platillos')
  @ApiOperation({ summary: 'Crear un platillo en la sucursal del gerente' })
  @ApiCreatedResponse({ type: PlatilloResponseDto })
  @ApiNotFoundResponse({ description: 'La categoría no existe' })
  @ApiConflictResponse({ description: 'Ya existe un platillo con ese nombre' })
  @ApiUnprocessableEntityResponse({ description: 'Categoría deshabilitada' })
  crear(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Body() dto: GuardarPlatilloDto,
    @CurrentUser() usuario: User,
  ): Promise<PlatilloResponseDto> {
    return this.service.crear(sucursalId, dto, usuario.sucursalId);
  }

  @Put('platillos/:id')
  @ApiOperation({
    summary: 'Editar un platillo (permitido aunque esté deshabilitado)',
  })
  @ApiOkResponse({ type: PlatilloResponseDto })
  @ApiNotFoundResponse({ description: 'El platillo o la categoría no existe' })
  @ApiConflictResponse({ description: 'Ya existe un platillo con ese nombre' })
  @ApiUnprocessableEntityResponse({ description: 'Categoría deshabilitada' })
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarPlatilloDto,
    @CurrentUser() usuario: User,
  ): Promise<PlatilloResponseDto> {
    return this.service.editar(id, dto, usuario.sucursalId);
  }

  @Patch('platillos/:id/deshabilitar')
  @ApiOperation({ summary: 'Deshabilitar un platillo (borrado lógico)' })
  @ApiOkResponse({ type: PlatilloDeshabilitadoResponseDto })
  @ApiNotFoundResponse({ description: 'El platillo no existe' })
  @ApiConflictResponse({ description: 'El platillo ya está deshabilitado' })
  deshabilitar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ): Promise<PlatilloDeshabilitadoResponseDto> {
    return this.service.deshabilitar(id, usuario.sucursalId);
  }
}
