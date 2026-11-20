import { Module } from '@nestjs/common';
import { BeneficiosController } from './controllers/beneficios.controller.js';
import { ReglaPuntosController } from './controllers/regla-puntos.controller.js';
import { BeneficiosRepository } from './repositories/beneficios.repository.js';
import { BeneficiosService } from './services/beneficios.service.js';
import { ReglaPuntosService } from './services/regla-puntos.service.js';

@Module({
  controllers: [BeneficiosController, ReglaPuntosController],
  providers: [BeneficiosRepository, BeneficiosService, ReglaPuntosService],
  exports: [ReglaPuntosService],
})
export class BeneficiosModule {}
