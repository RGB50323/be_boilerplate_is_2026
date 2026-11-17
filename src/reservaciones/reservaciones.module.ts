import { Module } from '@nestjs/common';
import {
  ReservacionesController,
  ReservasClienteController,
  EdicionReservacionController,
} from '@Reservaciones/controllers';
import {
  ReservacionesService,
  EdicionReservacionService,
} from '@Reservaciones/services';
import {
  ReservacionRepository,
  EdicionReservacionRepository,
} from '@Reservaciones/repositories';
import { NotificacionesModule } from '@Notificaciones';

@Module({
  imports: [NotificacionesModule],
  controllers: [
    ReservacionesController,
    ReservasClienteController,
    EdicionReservacionController,
  ],
  providers: [
    ReservacionesService,
    ReservacionRepository,
    EdicionReservacionService,
    EdicionReservacionRepository,
  ],
})
export class ReservacionesModule {}
