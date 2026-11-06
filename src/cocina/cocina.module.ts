import { Module } from '@nestjs/common';
import { AuthModule } from '@Auth';
import { CocinaController } from '@Cocina/controllers';
import { CocinaGateway } from '@Cocina/gateways';
import { PedidoCocinaRepository } from '@Cocina/repositories';
import { CocinaEventsService, CocinaService } from '@Cocina/services';

@Module({
  // AuthModule aporta AuthService, que el gateway usa para validar el token
  // del handshake con las mismas reglas que JwtAuthGuard.
  imports: [AuthModule],
  controllers: [CocinaController],
  providers: [
    CocinaService,
    CocinaEventsService,
    PedidoCocinaRepository,
    CocinaGateway,
  ],
  // CocinaEventsService es el punto de integración para los módulos que
  // cambian pedidos (pedidos, pagos, marcar ítem listo).
  exports: [CocinaEventsService],
})
export class CocinaModule {}
