import { Injectable, Logger } from '@nestjs/common';
import type { EnviadorCorreo, MensajeCorreo } from '@Notificaciones/types';

// Proveedor temporal: solo registra el correo
@Injectable()
export class EnviadorCorreoLog implements EnviadorCorreo {
  private readonly logger = new Logger(EnviadorCorreoLog.name);

  enviar({ para, asunto }: MensajeCorreo): Promise<void> {
    this.logger.log(`Correo para ${para}: ${asunto}`);
    return Promise.resolve();
  }
}
