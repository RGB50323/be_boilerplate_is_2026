import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  EstadoCorreo,
  Prisma,
  type ModuloOrigen,
  type Rol,
} from '@PrismaClient';
import type {
  DestinatarioResuelto,
  NotificacionCreadaParaCorreo,
  NotificacionLeida,
  NotificacionListado,
} from '@Notificaciones/types';

export interface CrearNotificacionData {
  id: string;
  destinatarioId: string;
  titulo: string;
  mensaje: string;
  moduloOrigen: ModuloOrigen;
  referenciaTipo: string | null;
  referenciaId: string | null;
  estadoCorreo: EstadoCorreo | null;
}

@Injectable()
export class NotificacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  resolverUsuarioActivo(usuarioId: string): Promise<DestinatarioResuelto[]> {
    return this.prisma.user.findMany({
      where: { id: usuarioId, isActive: true },
      select: { id: true, email: true },
    });
  }

  resolverGrupoActivo(
    rol: Rol,
    sucursalId: number,
  ): Promise<DestinatarioResuelto[]> {
    return this.prisma.user.findMany({
      where: { rol, sucursalId, isActive: true },
      select: { id: true, email: true },
    });
  }

  async crearMuchas(data: CrearNotificacionData[]): Promise<number> {
    try {
      const resultado = await this.prisma.notificacion.createMany({
        data,
        skipDuplicates: true,
      });
      return resultado.count;
    } catch (error) {
      // Respaldo por si se escapa un P2002
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 0;
      }
      throw error;
    }
  }

  buscarCreadasParaCorreo(
    ids: string[],
  ): Promise<NotificacionCreadaParaCorreo[]> {
    return this.prisma.notificacion
      .findMany({
        where: { id: { in: ids }, estadoCorreo: EstadoCorreo.PENDIENTE },
        select: {
          id: true,
          titulo: true,
          mensaje: true,
          destinatario: { select: { email: true } },
        },
      })
      .then((notificaciones) =>
        notificaciones.map(({ destinatario, ...notificacion }) => ({
          ...notificacion,
          email: destinatario.email,
        })),
      );
  }

  registrarIntentoCorreo(
    id: string,
    estadoCorreo?: EstadoCorreo,
  ): Promise<void> {
    return this.prisma.notificacion
      .update({
        where: { id },
        data: {
          intentosCorreo: { increment: 1 },
          ...(estadoCorreo === undefined ? {} : { estadoCorreo }),
        },
      })
      .then(() => undefined);
  }

  listarPorUsuario(
    usuarioId: string,
    pagina: number,
    porPagina: number,
  ): Promise<NotificacionListado[]> {
    return this.prisma.notificacion.findMany({
      where: { destinatarioId: usuarioId },
      orderBy: { creadaEn: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true,
        titulo: true,
        mensaje: true,
        moduloOrigen: true,
        referenciaTipo: true,
        referenciaId: true,
        leida: true,
        creadaEn: true,
      },
    });
  }

  contarPorUsuario(usuarioId: string): Promise<number> {
    return this.prisma.notificacion.count({
      where: { destinatarioId: usuarioId },
    });
  }

  contarNoLeidasPorUsuario(usuarioId: string): Promise<number> {
    return this.prisma.notificacion.count({
      where: { destinatarioId: usuarioId, leida: false },
    });
  }

  async marcarLeida(
    id: string,
    usuarioId: string,
  ): Promise<NotificacionLeida | null> {
    const existente = await this.prisma.notificacion.findFirst({
      where: { id, destinatarioId: usuarioId },
      select: { id: true, leida: true, leidaEn: true },
    });

    if (existente === null || existente.leida) {
      return existente;
    }

    return this.prisma.notificacion.update({
      where: { id },
      data: { leida: true, leidaEn: new Date() },
      select: { id: true, leida: true, leidaEn: true },
    });
  }
}
