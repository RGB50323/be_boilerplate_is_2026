import { Module } from '@nestjs/common';
import { NotificacionesModule } from '@Notificaciones';
import {
  ReservacionesController,
  ReservasClienteController,
} from '@Reservaciones/controllers';
import {
  AvisosReservacionService,
  ReservacionesService,
} from '@Reservaciones/services';
import { ReservacionRepository } from '@Reservaciones/repositories';

@Module({
  imports: [NotificacionesModule],
  controllers: [ReservacionesController, ReservasClienteController],
  providers: [
    ReservacionesService,
    ReservacionRepository,
    AvisosReservacionService,
  ],
  exports: [AvisosReservacionService],
})
export class ReservacionesModule {}
