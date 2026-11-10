import { Module } from '@nestjs/common';
import { CategoriasController } from './controllers/categorias.controller.js';
import { PlatilloCategoriaController } from './controllers/platillo-categoria.controller.js';
import { CategoriasService } from './services/categorias.service.js';
import { CategoriasRepository } from './repositories/categorias.repository.js';


@Module({
  controllers: [CategoriasController, PlatilloCategoriaController],
  providers: [CategoriasService, CategoriasRepository],
})
export class CategoriasModule {}