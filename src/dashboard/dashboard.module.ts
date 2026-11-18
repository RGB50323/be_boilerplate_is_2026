import { Module } from '@nestjs/common';
import { DashboardController } from '@Dashboard/controllers';
import { DashboardService } from '@Dashboard/services';
import { DashboardRepository } from '@Dashboard/repositories';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
