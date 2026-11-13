import { Module } from '@nestjs/common';
import { PlatillosController } from './controllers/platillos.controller.js';
import { PlatillosService } from './services/platillos.service.js';
import { PlatillosRepository } from './repositories/platillos.repository.js';
import { ImagenesPlatilloService } from './services/imagenes-platillo.service.js';

@Module({
  controllers: [PlatillosController],
  providers: [PlatillosService, PlatillosRepository, ImagenesPlatilloService],
})
export class PlatillosModule {}