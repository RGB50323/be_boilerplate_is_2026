import { Module } from '@nestjs/common';
import {
  ResenasClienteController,
  ResenasController,
} from './controllers/index.js';
import { ResenaRepository } from './repositories/index.js';
import { ResenasClienteService, ResenasService } from './services/index.js';

@Module({
  controllers: [ResenasController, ResenasClienteController],
  providers: [ResenasService, ResenasClienteService, ResenaRepository],
})
export class ResenasModule {}
