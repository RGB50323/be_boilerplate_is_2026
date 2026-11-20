import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { Rol } from '@PrismaClient';
import {
  CrearBeneficioDto,
  EditarBeneficioDto,
  ID_MAXIMO,
  ListarBeneficiosDto,
  ListarPlatillosBeneficioDto,
} from '../dto/beneficio.dto.js';
import { BeneficiosService } from '../services/beneficios.service.js';

function validarId(id: number): number {
  if (id < 1 || id > ID_MAXIMO)
    throw new BadRequestException('El ID del beneficio es inválido.');
  return id;
}

@ApiTags('Beneficios')
@ApiBearerAuth()
@Roles(Rol.GERENTE, Rol.GERENTE_GENERAL)
@Controller('beneficios')
export class BeneficiosController {
  constructor(
    @Inject(BeneficiosService) private readonly servicio: BeneficiosService,
  ) {}

  @Get()
  listar(@Query() query: ListarBeneficiosDto) {
    return this.servicio.listar(query);
  }

  @Get('platillos')
  listarPlatillos(@Query() query: ListarPlatillosBeneficioDto) {
    return this.servicio.listarPlatillos(query.pagina, query.buscar);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(validarId(id));
  }

  @Post()
  crear(@Body() dto: CrearBeneficioDto) {
    return this.servicio.crear(dto);
  }

  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarBeneficioDto,
  ) {
    return this.servicio.editar(validarId(id), dto);
  }

  @Patch(':id/deshabilitar')
  deshabilitar(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.deshabilitar(validarId(id));
  }
}
