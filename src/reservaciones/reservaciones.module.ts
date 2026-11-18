import { Module } from '@nestjs/common';
import { NotificacionesModule } from '@Notificaciones';
import {
  ReservacionesController,
  ReservasClienteController,
  EdicionReservacionController,
} from '@Reservaciones/controllers';
import {
  AvisosReservacionService,
  EdicionReservacionService,
  RecordatoriosReservacionService,
  ReservacionesService,
} from '@Reservaciones/services';
import {
  ReservacionRepository,
  EdicionReservacionRepository,
} from '@Reservaciones/repositories';

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
    AvisosReservacionService,
    RecordatoriosReservacionService,
  ],
  exports: [AvisosReservacionService],
})
export class ReservacionesModule {}
