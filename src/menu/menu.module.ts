import { Module } from '@nestjs/common';
import { MenuController } from './controllers/menu.controller.js';
import { MenuService } from './services/menu.service.js';
import { MenuRepository } from './repository/menu.repository.js';

@Module({
  controllers: [MenuController],
  providers: [MenuService, MenuRepository],
})
export class MenuModule {}