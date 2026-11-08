import { Module } from '@nestjs/common';
import { NotificacionesController } from '@Notificaciones/controllers';
import { NotificacionRepository } from '@Notificaciones/repositories';
import {
  EnviadorCorreoLog,
  NotificacionesService,
} from '@Notificaciones/services';
import {
  ENVIADOR_CORREO,
  ESPERAR_REINTENTO_CORREO,
  RETRASO_REINTENTO_CORREO_MS,
} from '@Notificaciones/types';

@Module({
  controllers: [NotificacionesController],
  providers: [
    NotificacionesService,
    NotificacionRepository,
    EnviadorCorreoLog,
    { provide: ENVIADOR_CORREO, useExisting: EnviadorCorreoLog },
    {
      provide: ESPERAR_REINTENTO_CORREO,
      useValue: (milisegundos: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milisegundos)),
    },
    { provide: RETRASO_REINTENTO_CORREO_MS, useValue: 20_000 },
  ],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
