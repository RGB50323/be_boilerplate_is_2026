import { Module } from '@nestjs/common';
import { PlatillosController } from './controllers/platillos.controller.js';
import { PlatillosService } from './services/platillos.service.js';
import { PlatillosRepository } from './repositories/platillos.repository.js';

@Module({
  controllers: [PlatillosController],
  providers: [PlatillosService, PlatillosRepository],
})
export class PlatillosModule {}