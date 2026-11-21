import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { MenuQueryDto } from '../dto/menu-query.dto.js';
import { MenuResponseDto } from '../dto/menu-response.dto.js';
import { MenuService } from '../services/menu.service.js';
import { Public } from '@Auth/decorators';

@ApiTags('Menú')
@Controller('sucursales')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Public()
  @Get(':sucursalId/menu')
  @ApiOperation({
    summary: 'Consultar el menú de una sucursal',
    description:
      'Devuelve los platillos visibles (activos, de categoría activa y con disponibilidad mayor a 0) agrupados por categoría, con búsqueda por nombre y filtros por categoría y precio.',
  })
  @ApiParam({ name: 'sucursalId', type: Number, example: 1 })
  @ApiOkResponse({ type: MenuResponseDto })
  @ApiBadRequestResponse({
    description:
      'precioMin mayor que precioMax, o valores negativos o inválidos',
  })
  @ApiNotFoundResponse({ description: 'La sucursal no existe' })
  obtenerMenu(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Query() query: MenuQueryDto,
  ): Promise<MenuResponseDto> {
    return this.menuService.obtenerMenu(sucursalId, query);
  }
}
