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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import {
  AdquirirCuponDto,
  BeneficioAdministrativoDto,
  BeneficioDto,
  ConfigurarReglaDto,
  CrearBeneficioDto,
  CuponDto,
  EditarBeneficioDto,
  PuntosResponseDto,
  ReglaPuntosDto,
} from '../dto/index.js';
import { LealtadService } from '../services/index.js';

@ApiTags('Lealtad')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'El rol no tiene acceso' })
@Controller('lealtad')
export class LealtadController {
  constructor(private readonly lealtad: LealtadService) {}

  @Get('puntos')
  @Roles(Rol.CLIENTE)
  @ApiOperation({
    summary: 'Mi saldo de puntos y el historial de movimientos (H18)',
    description:
      'Los puntos de un pago confirmado quedan pendientes 24 horas antes de poder canjearse.',
  })
  @ApiOkResponse({ type: PuntosResponseDto })
  puntos(@CurrentUser() usuario: User) {
    return this.lealtad.puntos(usuario.id);
  }

  @Get('beneficios')
  @Roles(Rol.CLIENTE)
  @ApiOperation({ summary: 'Catálogo de beneficios activos y vigentes (H19)' })
  @ApiOkResponse({ type: [BeneficioDto] })
  beneficios() {
    return this.lealtad.beneficiosDisponibles();
  }

  @Get('mis-cupones')
  @Roles(Rol.CLIENTE)
  @ApiOperation({
    summary: 'Mis beneficios: cupones canjeados con su código y estado (H19)',
  })
  @ApiOkResponse({ type: [CuponDto] })
  misCupones(@CurrentUser() usuario: User) {
    return this.lealtad.misCupones(usuario.id);
  }

  @Post('canjes')
  @Roles(Rol.CLIENTE)
  @ApiOperation({
    summary: 'Canjear puntos por un beneficio (H19)',
    description:
      'Descuenta los puntos y devuelve el cupón con su código. La misma claveIdempotencia devuelve el mismo cupón, así un doble Confirmar hace un solo canje.',
  })
  @ApiCreatedResponse({ type: CuponDto })
  @ApiBadRequestResponse({ description: 'Datos del canje inválidos' })
  @ApiNotFoundResponse({ description: 'El beneficio está inactivo o vencido' })
  @ApiConflictResponse({
    description: 'Puntos insuficientes o clave usada en otro canje',
  })
  adquirir(@CurrentUser() usuario: User, @Body() dto: AdquirirCuponDto) {
    return this.lealtad.adquirir(usuario.id, dto);
  }

  @Get('cupones/:codigo')
  @Roles(Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  @ApiOperation({ summary: 'Verificar el cupón que presenta un cliente' })
  @ApiOkResponse({ type: CuponDto })
  @ApiNotFoundResponse({ description: 'El cupón no existe' })
  @ApiConflictResponse({ description: 'El cupón ya fue utilizado' })
  @ApiGoneResponse({ description: 'El cupón ha expirado' })
  verificar(@Param('codigo') codigo: string) {
    return this.lealtad.verificar(codigo);
  }

  @Patch('cupones/:codigo/utilizar')
  @Roles(Rol.MESERO, Rol.GERENTE, Rol.GERENTE_GENERAL)
  @ApiOperation({ summary: 'Confirmar la entrega del beneficio de un cupón' })
  @ApiOkResponse({ type: CuponDto })
  @ApiNotFoundResponse({ description: 'El cupón no existe' })
  @ApiConflictResponse({ description: 'El cupón ya fue utilizado' })
  @ApiGoneResponse({ description: 'El cupón ha expirado' })
  utilizar(@Param('codigo') codigo: string) {
    return this.lealtad.utilizar(codigo);
  }

  @Get('admin/beneficios')
  @Roles(Rol.GERENTE)
  @ApiOperation({ summary: 'Beneficios con su estado (H20)' })
  @ApiOkResponse({ type: [BeneficioAdministrativoDto] })
  beneficiosAdministrativos() {
    return this.lealtad.beneficiosAdministrativos();
  }

  @Post('admin/beneficios')
  @Roles(Rol.GERENTE)
  @ApiOperation({ summary: 'Crear un beneficio (H20)' })
  @ApiCreatedResponse({ type: BeneficioDto })
  @ApiBadRequestResponse({
    description: 'Nombre vacío, costo menor a 1 o fechas inválidas',
  })
  crear(@CurrentUser() usuario: User, @Body() dto: CrearBeneficioDto) {
    return this.lealtad.crearBeneficio(usuario.id, dto);
  }

  @Patch('admin/beneficios/:id')
  @Roles(Rol.GERENTE)
  @ApiOperation({
    summary: 'Editar un beneficio (H20)',
    description: 'Guarda la fecha de modificación y el historial.',
  })
  @ApiOkResponse({ type: BeneficioDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  @ApiNotFoundResponse({ description: 'El beneficio no existe' })
  @ApiConflictResponse({ description: 'El beneficio ya fue deshabilitado' })
  editar(
    @CurrentUser() usuario: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarBeneficioDto,
  ) {
    return this.lealtad.editarBeneficio(usuario.id, id, dto);
  }

  @Delete('admin/beneficios/:id')
  @Roles(Rol.GERENTE)
  @ApiOperation({
    summary: 'Deshabilitar un beneficio (H20)',
    description:
      'Deja de poder canjearse; se conserva su registro y la fecha de deshabilitación.',
  })
  @ApiOkResponse({ type: BeneficioDto })
  @ApiNotFoundResponse({ description: 'El beneficio no existe' })
  @ApiConflictResponse({ description: 'El beneficio ya fue deshabilitado' })
  deshabilitar(
    @CurrentUser() usuario: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lealtad.editarBeneficio(usuario.id, id, null);
  }

  @Get('admin/regla')
  @Roles(Rol.GERENTE)
  @ApiOperation({ summary: 'Regla de acumulación vigente (H20)' })
  @ApiOkResponse({ type: ReglaPuntosDto, description: 'null si no hay regla' })
  consultarRegla() {
    return this.lealtad.consultarRegla();
  }

  @Put('admin/regla')
  @Roles(Rol.GERENTE)
  @ApiOperation({
    summary: 'Cambiar los puntos por dólar (H20)',
    description:
      'Solo aplica a compras posteriores; los puntos ya acumulados no cambian.',
  })
  @ApiOkResponse({ type: ReglaPuntosDto })
  @ApiBadRequestResponse({ description: 'Debe ser un entero entre 1 y 10' })
  configurarRegla(
    @CurrentUser() usuario: User,
    @Body() dto: ConfigurarReglaDto,
  ) {
    return this.lealtad.configurarRegla(usuario.id, dto.puntosPorDolar);
  }

  @Delete('admin/regla')
  @Roles(Rol.GERENTE)
  @ApiOperation({
    summary: 'Deshabilitar la regla de acumulación (H20)',
    description:
      'Las compras posteriores no acumulan puntos hasta configurar una regla nueva.',
  })
  @ApiOkResponse({ type: ReglaPuntosDto })
  @ApiNotFoundResponse({ description: 'No hay una regla vigente' })
  deshabilitarRegla(@CurrentUser() usuario: User) {
    return this.lealtad.deshabilitarRegla(usuario.id);
  }
}
