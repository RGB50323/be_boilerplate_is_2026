import { Module } from '@nestjs/common';
import { CocinaModule } from '@Cocina';
import { MeseroController } from '@Mesero/controllers';
import { EntregasRepository } from '@Mesero/repositories';
import { EntregasService } from '@Mesero/services';

@Module({
  imports: [CocinaModule],
  controllers: [MeseroController],
  providers: [EntregasService, EntregasRepository],
})
export class MeseroModule {}
