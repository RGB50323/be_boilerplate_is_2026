import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MotivoOcultacion, User } from '@PrismaClient';
import { paginar, saltoDePagina } from '@Common/paginacion';
import type {
  ModeracionQueryDto,
  ModeracionResenasResponseDto,
  ResenaModeracionDto,
} from '../dto/index.js';
import { ResenaRepository } from '../repositories/index.js';
import { nombrePublico } from './resenas.service.js';

export const RESENAS_POR_PAGINA_MODERACION = 10;
export const YA_OCULTA = 'Esta reseña ya estaba oculta.';
const SIN_PERMISO = 'No tienes permiso para moderar esta reseña.';
const ID_MAXIMO = 2_147_483_647;

const fechaLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
});
const horaLocal = new Intl.DateTimeFormat('es-SV', {
  timeZone: 'America/El_Salvador',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type FilaModeracion = Awaited<
  ReturnType<ResenaRepository['listarModeracion']>
>[1][number];

// Nombre de quien ocultó la reseña (o su correo si no tiene nombre)
const nombreModerador = (u: {
  nombre: string | null;
  apellido: string | null;
  email: string;
}) => [u.nombre, u.apellido].filter(Boolean).join(' ') || u.email;

export function aModeracion(r: FilaModeracion): ResenaModeracionDto {
  return {
    id: r.id,
    platillo: r.platillo.nombre,
    estrellas: r.estrellas,
    comentario: r.comentario,
    fecha: fechaLocal.format(r.creadaEn),
    cliente: nombrePublico(r.cliente.nombre, r.cliente.apellido),
    estado: r.estado,
    ocultacion:
      r.ocultaEn && r.ocultaPor && r.motivoOcultacion
        ? {
            por: nombreModerador(r.ocultaPor),
            fecha: fechaLocal.format(r.ocultaEn),
            hora: horaLocal.format(r.ocultaEn),
            motivo: r.motivoOcultacion,
          }
        : null,
  };
}

@Injectable()
export class ModeracionResenasService {
  constructor(private readonly repository: ResenaRepository) {}

  async listar(
    usuario: User,
    { pagina, estado }: ModeracionQueryDto,
  ): Promise<ModeracionResenasResponseDto> {
    const sucursalId = this.sucursalDe(usuario);
    const [total, filas] = await this.repository.listarModeracion(
      sucursalId,
      estado,
      saltoDePagina(pagina, RESENAS_POR_PAGINA_MODERACION),
      RESENAS_POR_PAGINA_MODERACION,
    );
    return paginar(
      filas.map(aModeracion),
      total,
      pagina,
      RESENAS_POR_PAGINA_MODERACION,
    );
  }

  async ocultar(
    usuario: User,
    id: number,
    motivo: MotivoOcultacion,
  ): Promise<ResenaModeracionDto> {
    const sucursalId = this.sucursalDe(usuario);
    if (id > ID_MAXIMO) throw new NotFoundException('La reseña no existe.');

    const resena = await this.repository.buscarModeracion(id);
    if (resena === null) throw new NotFoundException('La reseña no existe.');
    if (resena.pedido.sucursalId !== sucursalId) {
      throw new ForbiddenException(SIN_PERMISO);
    }
    if (!(await this.repository.ocultar(id, usuario.id, motivo))) {
      throw new ConflictException(YA_OCULTA);
    }

    const oculta = await this.repository.buscarModeracion(id);
    return aModeracion(oculta as FilaModeracion);
  }

  // Un gerente solo modera su propia sucursal
  private sucursalDe(usuario: User): number {
    if (usuario.sucursalId === null) throw new ForbiddenException(SIN_PERMISO);
    return usuario.sucursalId;
  }
}
