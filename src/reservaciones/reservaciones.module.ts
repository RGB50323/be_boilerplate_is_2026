import { CancelacionReservacionController } from './controllers/cancelacion-reservacion.controller.js';
import { CancelacionReservacionService } from './services/cancelacion-reservacion.service.js';
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
    CancelacionReservacionController,
    ReservacionesController,
    ReservasClienteController,
    EdicionReservacionController,
  ],
  providers: [
    CancelacionReservacionService,
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
