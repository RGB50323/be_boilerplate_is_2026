import { Module } from '@nestjs/common';
import { ReservacionesController } from '@Reservaciones/controllers';
import { ReservacionesService } from '@Reservaciones/services';
import { ReservacionRepository } from '@Reservaciones/repositories';

@Module({
  controllers: [ReservacionesController],
  providers: [ReservacionesService, ReservacionRepository],
})
export class ReservacionesModule {}
