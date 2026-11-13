import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { PlatilloCategoriaResponseDto } from '../dto/categorias-response.dto.js';
import { CambiarCategoriaPlatilloDto } from '../dto/cambiar-categoria-platillo.dto.js';


@ApiTags('Categorías')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'El rol del usuario no es GERENTE.' })
@Roles(Rol.GERENTE)
@Controller('platillos')
export class PlatilloCategoriaController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Patch(':id/categoria')
  @ApiOperation({ summary: 'Asocia un platillo a otra categoría' })
  @ApiOkResponse({ type: PlatilloCategoriaResponseDto })
  @ApiBadRequestResponse({ description: 'El id o categoriaId no son válidos.' })
  @ApiNotFoundResponse({
    description: 'El platillo o la categoría no existen.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'La categoría está deshabilitada.',
  })
  cambiarCategoria(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarCategoriaPlatilloDto,
  ): Promise<PlatilloCategoriaResponseDto> {
    return this.categoriasService.cambiarCategoriaDePlatillo(
      id,
      dto.categoriaId,
    );
  }
}
