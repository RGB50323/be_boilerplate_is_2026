import { Module } from '@nestjs/common';
import { ComprobantesRepository } from './repositories/comprobantes.repository.js';
import { ComprobantesService } from './services/comprobantes.service.js';
import { ComprobantesController } from './controllers/comprobantes.controller.js';
import { ComprobantePdfGenerator } from './services/comprobante-pdf.generator.js';

@Module({
  controllers: [ComprobantesController],
  providers: [
    ComprobantesRepository,
    ComprobantesService,
    ComprobantePdfGenerator,
  ],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
