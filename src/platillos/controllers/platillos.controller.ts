import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
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
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiPayloadTooLargeResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { ImagenPlatilloResponseDto } from '../dto/index.js';
import {
  type ArchivoSubido,
  ImagenesPlatilloService,
  TAMANO_MAXIMO_IMAGEN,
} from '../services/imagenes-platillo.service.js';
import { ListarPlatillosQueryDto } from '../dto/listar-platillos-query.dto.js';
import { PlatillosPaginadosResponseDto } from '../dto/platillos-paginados-response.dto.js';

@ApiTags('Platillos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({
  description: 'Rol distinto a GERENTE o sucursal no administrada',
})
@Roles(Rol.GERENTE)
@Controller()
export class PlatillosController {
  constructor(
    private readonly service: PlatillosService,
    private readonly imagenes: ImagenesPlatilloService,
  ) {}

  @Roles(Rol.GERENTE, Rol.MESERO)
  @Get('sucursales/:sucursalId/platillos')
  @ApiOperation({
    summary: 'Listar los platillos de la sucursal, paginados y con búsqueda',
    description:
      '10 por página. El gerente ve también los deshabilitados; el mesero solo los activos.',
  })
  @ApiOkResponse({ type: PlatillosPaginadosResponseDto })
  listar(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Query() query: ListarPlatillosQueryDto,
    @CurrentUser() usuario: User,
  ): Promise<PlatillosPaginadosResponseDto> {
    return this.service.listar(sucursalId, usuario, query);
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

  @Post('platillos/imagen')
  @UseInterceptors(
    FileInterceptor('imagen', { limits: { fileSize: TAMANO_MAXIMO_IMAGEN } }),
  )
  @ApiOperation({
    summary: 'Subir la imagen de un platillo (JPG o PNG, máx. 2 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['imagen'],
      properties: { imagen: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: ImagenPlatilloResponseDto })
  @ApiBadRequestResponse({ description: 'No se adjuntó ninguna imagen' })
  @ApiPayloadTooLargeResponse({ description: 'La imagen supera los 2 MB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'No es JPG ni PNG' })
  subirImagen(
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ): Promise<ImagenPlatilloResponseDto> {
    return this.imagenes.guardar(archivo);
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

  @Patch('platillos/:id/habilitar')
  @ApiOperation({ summary: 'Volver a habilitar un platillo deshabilitado' })
  @ApiOkResponse({ type: PlatilloDeshabilitadoResponseDto })
  @ApiNotFoundResponse({ description: 'El platillo o la categoría no existe' })
  @ApiConflictResponse({ description: 'El platillo ya está habilitado' })
  @ApiUnprocessableEntityResponse({ description: 'Categoría deshabilitada' })
  habilitar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ): Promise<PlatilloDeshabilitadoResponseDto> {
    return this.service.habilitar(id, usuario.sucursalId);
  }

  @Roles(Rol.GERENTE)
  @Get('platillos/:id')
  @ApiOperation({ summary: 'Obtener un platillo de la sucursal del gerente' })
  @ApiOkResponse({ type: PlatilloResponseDto })
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ): Promise<PlatilloResponseDto> {
    return this.service.obtener(id, usuario.sucursalId);
  }
}
