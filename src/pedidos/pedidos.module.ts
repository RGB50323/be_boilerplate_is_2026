import { Module } from '@nestjs/common';
import { PedidosRepository } from './repositories/pedidos.repository.js';
import { PedidosService } from './services/pedidos.service.js';
import { PedidosController } from './controller/pedidos.controller.js';

@Module({
  controllers: [PedidosController],
  providers: [PedidosService, PedidosRepository],
})
export class PedidosModule {}