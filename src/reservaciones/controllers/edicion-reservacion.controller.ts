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
import {
  IdReservacionDto,
  ModificarReservacionDto,
} from '../dto/modificar-reservacion.dto.js';
import { ConsultarDisponibilidadDto } from '../dto/consultar-disponibilidad.dto.js';
import { EdicionReservacionService } from '../services/edicion-reservacion.service.js';

@ApiTags('reservaciones')
@ApiBearerAuth()
@Controller('reservaciones')
export class EdicionReservacionController {
  constructor(private readonly service: EdicionReservacionService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Detalle de una reservación del cliente autenticado',
  })
  detalle(@Param() params: IdReservacionDto, @CurrentUser() usuario: User) {
    return this.service.detalle(params.id, usuario.id);
  }

  @Patch(':id')
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

  @Get(':id/mesas-disponibles')
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
