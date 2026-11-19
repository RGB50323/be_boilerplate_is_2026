import { Module } from '@nestjs/common';
import {
  ModeracionResenasController,
  ReporteResenasController,
  ResenasClienteController,
  ResenasController,
} from './controllers/index.js';
import { ResenaRepository } from './repositories/index.js';
import {
  ModeracionResenasService,
  ReporteResenasService,
  ResenasClienteService,
  ResenasService,
} from './services/index.js';

@Module({
  controllers: [
    ResenasController,
    ResenasClienteController,
    ReporteResenasController,
    ModeracionResenasController,
  ],
  providers: [
    ResenasService,
    ResenasClienteService,
    ReporteResenasService,
    ModeracionResenasService,
    ResenaRepository,
  ],
})
export class ResenasModule {}
