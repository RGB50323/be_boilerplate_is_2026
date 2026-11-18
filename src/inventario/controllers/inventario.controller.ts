import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
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
import { CurrentUser, Roles } from '@Auth/decorators';
import { PaginacionQueryDto } from '@Common/paginacion';
import {
  CrearInsumoDto,
  HistorialMovimientosResponseDto,
  InsumoResponseDto,
  ListarInsumosQueryDto,
  MovimientoRegistradoResponseDto,
  RegistrarMovimientoDto,
} from '@Inventario/dto';
import { InventarioService } from '@Inventario/services';
import { Rol, type User } from '@PrismaClient';

@ApiTags('inventario')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Roles(Rol.GERENTE)
@Controller('inventario/insumos')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los insumos de la sucursal del gerente',
    description:
      'Ordenados por nombre. `q` filtra por parte del nombre sin distinguir mayúsculas. ' +
      'El estado es BAJO si la cantidad es menor o igual al mínimo.',
  })
  @ApiOkResponse({ type: InsumoResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'La búsqueda no es válida.' })
  @ApiForbiddenResponse({
    description: 'El rol no es GERENTE o el usuario no tiene sucursal asignada.',
  })
  listar(
    @Query() query: ListarInsumosQueryDto,
    @CurrentUser() user: User,
  ): Promise<InsumoResponseDto[]> {
    return this.inventarioService.listar(user, query.q);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra un insumo en la sucursal del gerente',
    description: 'La cantidad inicial es 0; se modifica con entradas y salidas.',
  })
  @ApiCreatedResponse({ type: InsumoResponseDto })
  @ApiBadRequestResponse({
    description: 'Nombre o unidad vacíos, unidad no permitida o mínimo negativo.',
  })
  @ApiForbiddenResponse({
    description: 'El rol no es GERENTE o el usuario no tiene sucursal asignada.',
  })
  @ApiConflictResponse({
    description: 'Ya existe un insumo con ese nombre en la sucursal (sin distinguir mayúsculas).',
  })
  crear(
    @Body() dto: CrearInsumoDto,
    @CurrentUser() user: User,
  ): Promise<InsumoResponseDto> {
    return this.inventarioService.crear(user, dto);
  }

  @Post(':id/movimientos')
  @ApiOperation({
    summary: 'Registra una entrada o salida del insumo',
    description:
      'Guarda el movimiento y la nueva cantidad en una sola transacción, con la fila del ' +
      'insumo bloqueada. Registra el usuario, la fecha, la hora y el motivo.',
  })
  @ApiCreatedResponse({ type: MovimientoRegistradoResponseDto })
  @ApiBadRequestResponse({
    description: 'id no es un entero, cantidad menor o igual a 0, tipo inválido o motivo vacío.',
  })
  @ApiForbiddenResponse({
    description:
      'El rol no es GERENTE, el usuario no tiene sucursal o el insumo es de otra sucursal.',
  })
  @ApiNotFoundResponse({ description: 'El insumo no existe.' })
  @ApiUnprocessableEntityResponse({
    description:
      'La salida supera la existencia (la cantidad no cambia) o la entrada supera el máximo permitido.',
  })
  registrarMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarMovimientoDto,
    @CurrentUser() user: User,
  ): Promise<MovimientoRegistradoResponseDto> {
    return this.inventarioService.registrarMovimiento(id, user, dto);
  }

  @Get(':id/movimientos')
  @ApiOperation({
    summary: 'Historial de movimientos del insumo',
    description: '10 por página, del más reciente al más antiguo.',
  })
  @ApiOkResponse({ type: HistorialMovimientosResponseDto })
  @ApiBadRequestResponse({ description: 'id o página inválidos.' })
  @ApiForbiddenResponse({
    description:
      'El rol no es GERENTE, el usuario no tiene sucursal o el insumo es de otra sucursal.',
  })
  @ApiNotFoundResponse({ description: 'El insumo no existe.' })
  historial(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginacionQueryDto,
    @CurrentUser() user: User,
  ): Promise<HistorialMovimientosResponseDto> {
    return this.inventarioService.historial(id, user, query.pagina);
  }
}
