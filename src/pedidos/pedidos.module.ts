import { Module } from '@nestjs/common';
import { NotificacionesModule } from '@Notificaciones';
import { CocinaModule } from '@Cocina';
import { PedidosRepository } from './repositories/pedidos.repository.js';
import { PedidosLlevarRepository } from './repositories/pedidos-llevar.repository.js';
import { PedidosService } from './services/pedidos.service.js';
import { PedidosLlevarService } from './services/pedidos-llevar.service.js';
import { AvisoPedidoListoService } from './services/aviso-pedido-listo.service.js';
import { PedidosController } from './controller/pedidos.controller.js';
import { MesasController } from './controller/mesas.controller.js';

@Module({
  imports: [NotificacionesModule, CocinaModule],
  controllers: [PedidosController, MesasController],
  providers: [
    PedidosService,
    PedidosRepository,
    PedidosLlevarService,
    PedidosLlevarRepository,
    AvisoPedidoListoService,
  ],
  exports: [PedidosLlevarService],
})
export class PedidosModule {}
