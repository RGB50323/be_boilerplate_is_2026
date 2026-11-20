import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { ConfirmarReglaPuntosDto } from '../dto/confirmar-regla-puntos.dto.js';
import { ReglaPuntosService } from '../services/regla-puntos.service.js';

@ApiTags('Beneficios')
@ApiBearerAuth()
@Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
@Controller('reglas-puntos')
export class ReglaPuntosController {
  constructor(
    @Inject(ReglaPuntosService) private readonly servicio: ReglaPuntosService,
  ) {}

  @Get('vigente')
  async consultarVigente() {
    return { regla: await this.servicio.consultarVigente() };
  }

  @Put('vigente')
  async confirmar(
    @Body() dto: ConfirmarReglaPuntosDto,
    @CurrentUser() usuario: User,
  ) {
    return {
      regla: await this.servicio.confirmar(dto.puntosPorDolar, usuario.id),
    };
  }
}
