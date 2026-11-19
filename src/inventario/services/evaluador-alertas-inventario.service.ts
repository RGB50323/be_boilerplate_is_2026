import { Injectable, Logger } from '@nestjs/common';
import {
  AlertasInsumoRepository,
  type AlertaCreada,
  type InsumoTrasMovimiento,
} from '@Inventario/repositories';
import { deUnidadInsumo, estadoDeInsumo } from '@Inventario/utils';
import { NotificacionesService } from '@Notificaciones/services';
import { ModuloOrigen, Rol, type Prisma } from '@PrismaClient';

const LARGO_MAXIMO_TITULO = 100;

@Injectable()
export class EvaluadorAlertasInventario {
  private readonly logger = new Logger(EvaluadorAlertasInventario.name);

  constructor(
    private readonly alertasRepository: AlertasInsumoRepository,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async evaluar(
    tx: Prisma.TransactionClient,
    insumo: InsumoTrasMovimiento,
  ): Promise<AlertaCreada | null> {
    const abierta = await this.alertasRepository.findNoResuelta(insumo.insumoId, tx);

    if (estadoDeInsumo(insumo.cantidad, insumo.minimo) === 'BAJO') {
      if (abierta) return null;
      const alertaId = await this.alertasRepository.crear(insumo, tx);
      return alertaId === null ? null : { ...insumo, alertaId };
    }

    if (abierta) await this.alertasRepository.resolver(abierta.id, tx);
    return null;
  }

  async avisar(alerta: AlertaCreada): Promise<void> {
    const unidad = deUnidadInsumo(alerta.unidad);
    try {
      await this.notificaciones.notificar({
        destinatario: { rol: Rol.GERENTE, sucursalId: alerta.sucursalId },
        titulo: `Insumo por agotarse: ${alerta.nombre}`.slice(0, LARGO_MAXIMO_TITULO),
        mensaje:
          `${alerta.nombre} tiene ${alerta.cantidad.toNumber()} ${unidad} ` +
          `(mínimo ${alerta.minimo.toNumber()} ${unidad}) en ${alerta.sucursal}.`,
        moduloOrigen: ModuloOrigen.INVENTARIO,
        referencia: { tipo: 'ALERTA_INSUMO', id: String(alerta.alertaId) },
        enviarCorreo: true,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar la alerta ${alerta.alertaId} del insumo ${alerta.insumoId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
