import { Module } from '@nestjs/common';
import { InventarioController } from '@Inventario/controllers';
import { InsumosRepository } from '@Inventario/repositories';
import { EvaluadorAlertasInventario, InventarioService } from '@Inventario/services';

@Module({
  controllers: [InventarioController],
  providers: [InventarioService, InsumosRepository, EvaluadorAlertasInventario],
})
export class InventarioModule {}
