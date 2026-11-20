import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import {
  AdquirirCuponDto,
  ConfigurarReglaDto,
  CrearBeneficioDto,
  EditarBeneficioDto,
} from './lealtad.dto.js';
import { LealtadService } from './lealtad.service.js';

@Controller('lealtad')
export class LealtadController {
  constructor(private readonly lealtad: LealtadService) {}

  @Get('puntos')
  @Roles(Rol.CLIENTE)
  puntos(@CurrentUser() usuario: User) {
    return this.lealtad.puntos(usuario.id);
  }

  @Get('beneficios')
  @Roles(Rol.CLIENTE)
  beneficios() {
    return this.lealtad.beneficiosDisponibles();
  }

  @Post('canjes')
  @Roles(Rol.CLIENTE)
  adquirir(@CurrentUser() usuario: User, @Body() dto: AdquirirCuponDto) {
    return this.lealtad.adquirir(usuario.id, dto);
  }

  @Get('cupones/:codigo')
  @Roles(Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  verificar(@Param('codigo') codigo: string) {
    return this.lealtad.verificar(codigo);
  }

  @Patch('cupones/:codigo/utilizar')
  @Roles(Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  utilizar(@Param('codigo') codigo: string) {
    return this.lealtad.utilizar(codigo);
  }

  @Get('admin/beneficios')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  beneficiosAdministrativos() {
    return this.lealtad.beneficiosAdministrativos();
  }

  @Post('admin/beneficios')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  crear(@CurrentUser() usuario: User, @Body() dto: CrearBeneficioDto) {
    return this.lealtad.crearBeneficio(usuario.id, dto);
  }

  @Patch('admin/beneficios/:id')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  editar(
    @CurrentUser() usuario: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarBeneficioDto,
  ) {
    return this.lealtad.editarBeneficio(usuario.id, id, dto);
  }

  @Delete('admin/beneficios/:id')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  deshabilitar(
    @CurrentUser() usuario: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lealtad.editarBeneficio(usuario.id, id, null);
  }

  @Get('admin/regla')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  consultarRegla() {
    return this.lealtad.consultarRegla();
  }

  @Put('admin/regla')
  @Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
  configurarRegla(
    @CurrentUser() usuario: User,
    @Body() dto: ConfigurarReglaDto,
  ) {
    return this.lealtad.configurarRegla(usuario.id, dto.puntosPorDolar);
  }
}
