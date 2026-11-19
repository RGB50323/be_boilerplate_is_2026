import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import {
  PlatilloPendienteResenaDto,
  PublicarResenaDto,
  ResenaPublicadaResponseDto,
} from '../dto/index.js';
import { ResenasClienteService } from '../services/index.js';

@ApiTags('Reseñas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Inicia sesión para calificar' })
@ApiForbiddenResponse({ description: 'No eres cliente o el pedido no es tuyo' })
@Roles(Rol.CLIENTE)
@Controller('resenas')
export class ResenasClienteController {
  constructor(private readonly service: ResenasClienteService) {}

  @Post()
  @ApiOperation({
    summary: 'Calificar un platillo de un pedido propio',
    description:
      'De 1 a 5 estrellas y comentario opcional (máx. 500). El pedido debe tener pago confirmado hace 7 días o menos.',
  })
  @ApiCreatedResponse({ type: ResenaPublicadaResponseDto })
  @ApiBadRequestResponse({
    description: 'Estrellas fuera de 1–5 o comentario de más de 500',
  })
  @ApiNotFoundResponse({
    description: 'El pedido no existe o el platillo no está en él',
  })
  @ApiConflictResponse({
    description: 'Ya reseñaste ese platillo en el pedido',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Sin pago confirmado o pasaron más de 7 días',
  })
  publicar(
    @CurrentUser() usuario: User,
    @Body() dto: PublicarResenaDto,
  ): Promise<ResenaPublicadaResponseDto> {
    return this.service.publicar(usuario.id, dto);
  }

  @Get('pendientes')
  @ApiOperation({
    summary: 'Platillos de mis pedidos que todavía puedo reseñar',
  })
  @ApiOkResponse({ type: [PlatilloPendienteResenaDto] })
  pendientes(
    @CurrentUser() usuario: User,
  ): Promise<PlatilloPendienteResenaDto[]> {
    return this.service.pendientes(usuario.id);
  }
}
