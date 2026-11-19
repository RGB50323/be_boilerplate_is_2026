import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { ComprobantesService } from '../services/comprobantes.service.js';

@Controller('comprobantes')
@Roles(Rol.CLIENTE, Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
export class ComprobantesController {
  constructor(private readonly comprobantesService: ComprobantesService) {}

  @Get(':id')
  consultar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ) {
    return this.comprobantesService.consultar(id, usuario);
  }

  @Get(':id/pdf')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: User,
  ) {
    const { buffer, nombreArchivo } =
      await this.comprobantesService.descargarPdf(id, usuario);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${nombreArchivo}"`,
    });
  }
}
