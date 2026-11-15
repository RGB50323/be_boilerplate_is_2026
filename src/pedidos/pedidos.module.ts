import { Module } from '@nestjs/common';
import { PedidosRepository } from './repositories/pedidos.repository.js';
import { PedidosLlevarRepository } from './repositories/pedidos-llevar.repository.js';
import { PedidosService } from './services/pedidos.service.js';
import { PedidosLlevarService } from './services/pedidos-llevar.service.js';
import { PedidosController } from './controller/pedidos.controller.js';
import { MesasController } from './controller/mesas.controller.js';

@Module({
  controllers: [PedidosController, MesasController],
  providers: [
    PedidosService,
    PedidosRepository,
    PedidosLlevarService,
    PedidosLlevarRepository,
  ],
  exports: [PedidosLlevarService],
})
export class PedidosModule {}