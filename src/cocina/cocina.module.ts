import { Module } from '@nestjs/common';
import { AuthModule } from '@Auth';
import { CocinaController } from '@Cocina/controllers';
import { CocinaGateway } from '@Cocina/gateways';
import { PedidoCocinaRepository } from '@Cocina/repositories';
import {
  CocinaEventsService,
  CocinaItemsService,
  CocinaService,
} from '@Cocina/services';

@Module({
  imports: [AuthModule],
  controllers: [CocinaController],
  providers: [
    CocinaService,
    CocinaEventsService,
    CocinaItemsService,
    PedidoCocinaRepository,
    CocinaGateway,
  ],
  exports: [CocinaEventsService],
})
export class CocinaModule {}
