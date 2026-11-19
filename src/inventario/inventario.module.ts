import { Module } from '@nestjs/common';
import { AlertasController, InventarioController } from '@Inventario/controllers';
import { AlertasInsumoRepository, InsumosRepository } from '@Inventario/repositories';
import {
  AlertasService,
  EvaluadorAlertasInventario,
  InventarioService,
} from '@Inventario/services';
import { NotificacionesModule } from '@Notificaciones';

@Module({
  imports: [NotificacionesModule],
  controllers: [InventarioController, AlertasController],
  providers: [
    InventarioService,
    AlertasService,
    InsumosRepository,
    AlertasInsumoRepository,
    EvaluadorAlertasInventario,
  ],
})
export class InventarioModule {}
