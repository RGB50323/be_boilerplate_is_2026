import { Module } from '@nestjs/common';
import {
  ReporteResenasController,
  ResenasClienteController,
  ResenasController,
} from './controllers/index.js';
import { ResenaRepository } from './repositories/index.js';
import {
  ReporteResenasService,
  ResenasClienteService,
  ResenasService,
} from './services/index.js';

@Module({
  controllers: [
    ResenasController,
    ResenasClienteController,
    ReporteResenasController,
  ],
  providers: [
    ResenasService,
    ResenasClienteService,
    ReporteResenasService,
    ResenaRepository,
  ],
})
export class ResenasModule {}
