import { Controller, Header, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { IdReservacionDto } from '@Reservaciones/dto';
import { CancelacionReservacionService } from '../services/cancelacion-reservacion.service.js';

@ApiTags('reservaciones')
@ApiBearerAuth()
@Controller('reservaciones')
export class CancelacionReservacionController {
  constructor(private readonly service: CancelacionReservacionService) {}

  @Patch('R-:id/cancelar')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Cancela una reservación confirmada y futura del cliente autenticado',
  })
  cancelar(@Param() params: IdReservacionDto, @CurrentUser() usuario: User) {
    return this.service.cancelar(params.id, usuario.id);
  }
}
