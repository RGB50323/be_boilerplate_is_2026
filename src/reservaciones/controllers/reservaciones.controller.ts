import { Controller, Get, Header, Param, Query } from '@nestjs/common';
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
  ConsultarDisponibilidadDto,
  MesaDisponibleResponseDto,
  SucursalParamsDto,
  SucursalResponseDto,
} from '@Reservaciones/dto';
import { ReservacionesService } from '@Reservaciones/services';

@ApiTags('reservaciones')
@Controller('sucursales')
export class ReservacionesController {
  constructor(private readonly reservacionesService: ReservacionesService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Lista las sucursales con sus horarios de atención',
  })
  @ApiOkResponse({
    type: SucursalResponseDto,
    isArray: true,
    description:
      'Sucursales con horarios locales; lista vacía si no hay sucursales.',
  })
  listarSucursales(): Promise<SucursalResponseDto[]> {
    return this.reservacionesService.listarSucursales();
  }

  @Public()
  @Get(':id/mesas-disponibles')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Consulta pública de mesas disponibles durante 2 horas',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador de la sucursal.',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiOkResponse({
    type: MesaDisponibleResponseDto,
    isArray: true,
    description: 'Lista de mesas; vacía si no hay coincidencias.',
  })
  @ApiBadRequestResponse({
    description:
      'Parámetros inválidos, fecha/hora pasada o fuera del horario de atención.',
  })
  @ApiNotFoundResponse({ description: 'La sucursal solicitada no existe.' })
  consultarDisponibilidad(
    @Param() { id }: SucursalParamsDto,
    @Query() query: ConsultarDisponibilidadDto,
  ): Promise<MesaDisponibleResponseDto[]> {
    return this.reservacionesService.consultarDisponibilidad(id, query);
  }
}
