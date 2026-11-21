import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import { NotificacionesService } from '@Notificaciones/services';
import {
  ListaNotificacionesResponseDto,
  ListarNotificacionesQueryDto,
  NotificacionLeidaResponseDto,
  NotificacionResponseDto,
} from '@Notificaciones/dto';
import type { User } from '@PrismaClient';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las notificaciones del usuario autenticado' })
  @ApiOkResponse({ type: ListaNotificacionesResponseDto })
  @ApiBadRequestResponse({ description: 'La página solicitada no es válida.' })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  async listar(
    @CurrentUser() usuario: User,
    @Query() query: ListarNotificacionesQueryDto,
  ): Promise<ListaNotificacionesResponseDto> {
    const resultado = await this.notificacionesService.listar(
      usuario.id,
      query.pagina,
    );
    return {
      ...resultado,
      datos: resultado.datos.map((notificacion) =>
        NotificacionResponseDto.fromEntity(notificacion),
      ),
    };
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marca una notificación propia como leída' })
  @ApiOkResponse({ type: NotificacionLeidaResponseDto })
  @ApiBadRequestResponse({
    description: 'El identificador no es un UUID válido.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({
    description: 'La notificación no existe o pertenece a otro usuario.',
  })
  async marcarLeida(
    @CurrentUser() usuario: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NotificacionLeidaResponseDto> {
    const notificacion = await this.notificacionesService.marcarLeida(
      id,
      usuario.id,
    );
    return NotificacionLeidaResponseDto.fromEntity(notificacion);
  }
}
