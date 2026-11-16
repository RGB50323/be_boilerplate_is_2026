import { Module } from '@nestjs/common';
import {
  ReservacionesController,
  ReservasClienteController,
} from '@Reservaciones/controllers';
import { ReservacionesService } from '@Reservaciones/services';
import { ReservacionRepository } from '@Reservaciones/repositories';

@Module({
  controllers: [ReservacionesController, ReservasClienteController],
  providers: [ReservacionesService, ReservacionRepository],
})
export class ReservacionesModule {}
