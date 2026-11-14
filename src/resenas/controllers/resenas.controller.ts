import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import {
  ListarResenasQueryDto,
  ResenasPlatilloResponseDto,
} from '../dto/index.js';
import { ResenasService } from '../services/index.js';

@ApiTags('Reseñas')
@Controller('platillos')
export class ResenasController {
  constructor(private readonly resenasService: ResenasService) {}

  @Public()
  @Get(':id/resenas')
  @ApiOperation({
    summary: 'Consultar las reseñas de un platillo',
    description:
      'Reseñas visibles de la más reciente a la más antigua, 10 por página, con promedio (un decimal) y total. El cliente se muestra con nombre e inicial del apellido.',
  })
  @ApiParam({ name: 'id', type: Number, example: 10 })
  @ApiOkResponse({ type: ResenasPlatilloResponseDto })
  @ApiBadRequestResponse({ description: 'Página menor a 1 o inválida' })
  @ApiNotFoundResponse({
    description: 'El platillo no existe o está deshabilitado',
  })
  listar(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListarResenasQueryDto,
  ): Promise<ResenasPlatilloResponseDto> {
    return this.resenasService.listarPorPlatillo(id, query.pagina);
  }
}
