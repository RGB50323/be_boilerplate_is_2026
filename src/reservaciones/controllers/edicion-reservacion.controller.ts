import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { IdReservacionDto, ModificarReservacionDto } from '@Reservaciones/dto';
import { ConsultarDisponibilidadDto } from '@Reservaciones/dto';
import { EdicionReservacionService } from '@Reservaciones/services';

@ApiTags('reservaciones')
@ApiBearerAuth()
@Controller('reservaciones')
export class EdicionReservacionController {
  constructor(private readonly service: EdicionReservacionService) {}

  @Get('R-:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Detalle de una reservación del cliente autenticado',
  })
  detalle(@Param() params: IdReservacionDto, @CurrentUser() usuario: User) {
    return this.service.detalle(params.id, usuario.id);
  }

  @Patch('R-:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Modifica una reservación confirmada con control de versión y solapamientos',
  })
  modificar(
    @Param() params: IdReservacionDto,
    @CurrentUser() usuario: User,
    @Body() datos: ModificarReservacionDto,
  ) {
    return this.service.modificar(params.id, usuario.id, datos);
  }

  @Get('R-:id/mesas-disponibles')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Mesas alternativas excluyendo la propia reservación',
  })
  alternativas(
    @Param() params: IdReservacionDto,
    @CurrentUser() usuario: User,
    @Query() datos: ConsultarDisponibilidadDto,
  ) {
    return this.service.alternativas(params.id, usuario.id, datos);
  }
}
