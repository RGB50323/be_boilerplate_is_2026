import { Module } from '@nestjs/common';
import { PedidosRepository } from './repositories/pedidos.repository.js';
import { PedidosService } from './services/pedidos.service.js';
import { PedidosController } from './controller/pedidos.controller.js';
import { MesasController } from './controller/mesas.controller.js';

@Module({
  controllers: [PedidosController, MesasController],
  providers: [PedidosService, PedidosRepository],
})
export class PedidosModule {}