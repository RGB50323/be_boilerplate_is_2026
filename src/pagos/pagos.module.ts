import { Module } from '@nestjs/common';
import { PagosController } from './controllers/pagos.controller.js';
import { PagoRepository } from './repositories/pago.repository.js';
import { PagosService } from './services/pagos.service.js';
import { PasarelaSimuladaService } from './services/pasarela-simulada.service.js';
import { PedidosModule } from '../pedidos/pedidos.module.js';
import { ComprobantesModule } from '../comprobantes/comprobantes.module.js';

@Module({
  imports: [PedidosModule, ComprobantesModule],
  controllers: [PagosController],
  providers: [PagosService, PagoRepository, PasarelaSimuladaService],
  exports: [PagosService],
})
export class PagosModule {}
