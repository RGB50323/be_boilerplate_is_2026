import { Module } from '@nestjs/common';
import {
  ReservacionesController,
  ReservasClienteController,
} from '@Reservaciones/controllers';
import { ReservacionesService } from '@Reservaciones/services';
import { ReservacionRepository } from '@Reservaciones/repositories';
import { EdicionReservacionController } from './controllers/edicion-reservacion.controller.js';
import { EdicionReservacionService } from './services/edicion-reservacion.service.js';
import { EdicionReservacionRepository } from './repositories/edicion-reservacion.repository.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';

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
