import { Module } from '@nestjs/common';
import { NotificacionesModule } from '@Notificaciones';
import {
  ReservacionesController,
  ReservasClienteController,
} from '@Reservaciones/controllers';
import {
  AvisosReservacionService,
  RecordatoriosReservacionService,
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
    RecordatoriosReservacionService,
  ],
  exports: [AvisosReservacionService],
})
export class ReservacionesModule {}
