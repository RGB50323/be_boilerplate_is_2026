import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { PaginacionQueryDto } from '@Common/paginacion';
import {
  CrearReservacionDto,
  MisReservacionesResponseDto,
  ReservacionResponseDto,
} from '@Reservaciones/dto';
import { ReservacionesService } from '@Reservaciones/services';

@ApiTags('reservaciones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Iniciá sesión para continuar.' })
@Controller('reservaciones')
export class ReservasClienteController {
  constructor(private readonly service: ReservacionesService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Confirma una mesa por 2 horas para el usuario autenticado',
  })
  @ApiCreatedResponse({ type: ReservacionResponseDto })
  @ApiBadRequestResponse({
    description:
      'Campos inválidos, capacidad excedida o horario no válido; incluye errores por campo.',
  })
  @ApiNotFoundResponse({ description: 'Mesa inexistente o inactiva.' })
  @ApiConflictResponse({
    description: 'La mesa ya fue reservada en ese horario.',
  })
  crear(@CurrentUser() usuario: User, @Body() datos: CrearReservacionDto) {
    return this.service.crear(usuario.id, datos);
  }

  @Get('mias')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Mis reservaciones, más recientes primero, 10 por página',
  })
  @ApiOkResponse({ type: MisReservacionesResponseDto })
  @ApiBadRequestResponse({ description: 'Página inválida.' })
  listar(@CurrentUser() usuario: User, @Query() query: PaginacionQueryDto) {
    return this.service.listarMias(usuario.id, query.pagina);
  }
}
