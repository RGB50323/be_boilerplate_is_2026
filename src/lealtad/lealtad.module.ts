import { Module } from '@nestjs/common';
import { BeneficiosModule } from '../beneficios/beneficios.module.js';
import { UsersModule } from '@Users';
import { AcreditacionesRepository } from './repositories/acreditaciones.repository.js';
import { AcreditacionesService } from './services/acreditaciones.service.js';

@Module({
  imports: [BeneficiosModule, UsersModule],
  providers: [AcreditacionesRepository, AcreditacionesService],
  exports: [AcreditacionesService],
})
export class LealtadModule {}
