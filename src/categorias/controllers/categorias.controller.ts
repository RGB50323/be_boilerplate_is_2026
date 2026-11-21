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
  ApiBadRequestResponse,
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
import { Roles } from '@Auth/decorators';
import { Rol } from '@PrismaClient';
import { CategoriasService } from '../services/categorias.service.js';
import {
  CategoriaDeshabilitadaResponseDto,
  CategoriaResponseDto,
  GuardarCategoriaDto,
  PlatilloDeCategoriaResponseDto,
} from '@Categorias/dto';
import { PaginacionQueryDto } from '@Common/paginacion';
import { CategoriasPaginadasResponseDto } from '../dto/categorias-paginadas-response.dto.js';

@ApiTags('Categorías')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'El rol del usuario no es GERENTE.' })
@Roles(Rol.GERENTE)
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una categoría del menú' })
  @ApiCreatedResponse({ type: CategoriaResponseDto })
  @ApiBadRequestResponse({
    description: 'Nombre vacío o de más de 50 caracteres.',
  })
  @ApiConflictResponse({
    description: 'Ya existe una categoría con ese nombre.',
  })
  crear(@Body() dto: GuardarCategoriaDto): Promise<CategoriaResponseDto> {
    return this.categoriasService.crear(dto.nombre);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Renombra una categoría' })
  @ApiOkResponse({ type: CategoriaResponseDto })
  @ApiBadRequestResponse({
    description: 'Nombre vacío, de más de 50 caracteres o id inválido.',
  })
  @ApiNotFoundResponse({ description: 'La categoría no existe.' })
  @ApiConflictResponse({
    description: 'Ya existe una categoría con ese nombre.',
  })
  renombrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarCategoriaDto,
  ): Promise<CategoriaResponseDto> {
    return this.categoriasService.renombrar(id, dto.nombre);
  }

  @Patch(':id/deshabilitar')
  @ApiOperation({ summary: 'Deshabilita una categoría sin platillos activos' })
  @ApiOkResponse({ type: CategoriaDeshabilitadaResponseDto })
  @ApiBadRequestResponse({ description: 'El id no es un número entero.' })
  @ApiNotFoundResponse({ description: 'La categoría no existe.' })
  @ApiConflictResponse({ description: 'La categoría ya está deshabilitada.' })
  @ApiUnprocessableEntityResponse({
    description: 'La categoría tiene platillos activos asociados.',
  })
  deshabilitar(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoriaDeshabilitadaResponseDto> {
    return this.categoriasService.deshabilitar(id);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista las categorías, incluidas las deshabilitadas (paginado)',
    description: '10 por página.',
  })
  @ApiOkResponse({ type: CategoriasPaginadasResponseDto })
  @ApiBadRequestResponse({ description: 'Página menor a 1 o inválida.' })
  listar(
    @Query() query: PaginacionQueryDto,
  ): Promise<CategoriasPaginadasResponseDto> {
    return this.categoriasService.listar(query.pagina);
  }

  @Get('activas')
  @ApiOperation({
    summary: 'Lista todas las categorías activas, sin paginar',
    description: 'Para los selectores de los formularios.',
  })
  @ApiOkResponse({ type: [CategoriaResponseDto] })
  listarActivas(): Promise<CategoriaResponseDto[]> {
    return this.categoriasService.listarActivas();
  }

  @Get(':id/platillos')
  @ApiOperation({ summary: 'Lista los platillos activos de una categoría' })
  @ApiOkResponse({ type: [PlatilloDeCategoriaResponseDto] })
  @ApiBadRequestResponse({ description: 'El id no es un número entero.' })
  @ApiNotFoundResponse({ description: 'La categoría no existe.' })
  listarPlatillos(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PlatilloDeCategoriaResponseDto[]> {
    return this.categoriasService.listarPlatillos(id);
  }
}
