import { Module } from '@nestjs/common';
import { ResenasController } from './controllers/index.js';
import { ResenaRepository } from './repositories/index.js';
import { ResenasService } from './services/index.js';

@Module({
  controllers: [ResenasController],
  providers: [ResenasService, ResenaRepository],
})
export class ResenasModule {}
