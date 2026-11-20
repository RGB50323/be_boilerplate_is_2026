import { Module } from '@nestjs/common';
import { BeneficiosController } from './controllers/beneficios.controller.js';
import { BeneficiosRepository } from './repositories/beneficios.repository.js';
import { BeneficiosService } from './services/beneficios.service.js';

@Module({
  controllers: [BeneficiosController],
  providers: [BeneficiosRepository, BeneficiosService],
})
export class BeneficiosModule {}
