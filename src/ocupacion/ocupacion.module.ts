import { Module } from '@nestjs/common';
import { AuthModule } from '@Auth';
import { OcupacionController } from './controllers/ocupacion.controller.js';
import { OcupacionGateway } from './gateways/ocupacion.gateway.js';
import { OcupacionRepository } from './repositories/ocupacion.repository.js';
import { OcupacionService } from './services/ocupacion.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OcupacionController],
  providers: [
    OcupacionService,
    OcupacionRepository,
    OcupacionGateway,
  ],
  exports: [OcupacionService, OcupacionGateway],
})
export class OcupacionModule {}
