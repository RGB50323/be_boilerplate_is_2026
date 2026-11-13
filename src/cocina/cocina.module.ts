import { Module } from '@nestjs/common';
import { AuthModule } from '@Auth';
import { CocinaController } from '@Cocina/controllers';
import { CocinaGateway } from '@Cocina/gateways';
import { PedidoCocinaRepository } from '@Cocina/repositories';
import { CocinaEventsService, CocinaService } from '@Cocina/services';

@Module({
  imports: [AuthModule],
  controllers: [CocinaController],
  providers: [
    CocinaService,
    CocinaEventsService,
    PedidoCocinaRepository,
    CocinaGateway,
  ],
  exports: [CocinaEventsService],
})
export class CocinaModule {}
