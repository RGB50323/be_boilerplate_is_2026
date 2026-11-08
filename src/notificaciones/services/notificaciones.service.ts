import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoCorreo, ModuloOrigen, Rol } from '@PrismaClient';
import { NotificacionRepository } from '@Notificaciones/repositories';
import { ValidacionAvisoError } from '@Notificaciones/errors';
import type {
  Aviso,
  DestinatarioResuelto,
  EnviadorCorreo,
  EsperarReintentoCorreo,
  NotificacionLeida,
  NotificacionListado,
  ResultadoNotificacion,
} from '@Notificaciones/types';
import {
  ENVIADOR_CORREO,
  ESPERAR_REINTENTO_CORREO,
  RETRASO_REINTENTO_CORREO_MS,
} from '@Notificaciones/types';

const POR_PAGINA = 20;
const MAXIMO_INTENTOS_CORREO = 3;

export interface ResultadoListadoNotificaciones {
  datos: NotificacionListado[];
  total: number;
  pagina: number;
  noLeidas: number;
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly repository: NotificacionRepository,
    @Inject(ENVIADOR_CORREO) private readonly enviadorCorreo: EnviadorCorreo,
    @Inject(ESPERAR_REINTENTO_CORREO)
    private readonly esperarReintento: EsperarReintentoCorreo,
    @Inject(RETRASO_REINTENTO_CORREO_MS)
    private readonly retrasoReintentoCorreoMs: number,
  ) {}

  async notificar(aviso: Aviso): Promise<ResultadoNotificacion> {
    const avisoValidado = this.validarAviso(aviso);
    const destinatarios = await this.resolverDestinatarios(avisoValidado);

    if (destinatarios.length === 0) {
      return { registradas: 0, omitidasPorDuplicado: 0 };
    }

    const ids = destinatarios.map(() => randomUUID());
    const registradas = await this.repository.crearMuchas(
      destinatarios.map((destinatario, indice) => ({
        id: ids[indice] as string,
        destinatarioId: destinatario.id,
        titulo: avisoValidado.titulo,
        mensaje: avisoValidado.mensaje,
        moduloOrigen: avisoValidado.moduloOrigen,
        referenciaTipo: avisoValidado.referencia?.tipo ?? null,
        referenciaId: avisoValidado.referencia?.id ?? null,
        estadoCorreo: avisoValidado.enviarCorreo
          ? EstadoCorreo.PENDIENTE
          : null,
      })),
    );

    if (avisoValidado.enviarCorreo && registradas > 0) {
      // Correo en segundo plano
      void this.procesarCorreos(ids);
    }

    return {
      registradas,
      omitidasPorDuplicado: destinatarios.length - registradas,
    };
  }

  async listar(
    usuarioId: string,
    pagina: number,
  ): Promise<ResultadoListadoNotificaciones> {
    const [datos, total, noLeidas] = await Promise.all([
      this.repository.listarPorUsuario(usuarioId, pagina, POR_PAGINA),
      this.repository.contarPorUsuario(usuarioId),
      this.repository.contarNoLeidasPorUsuario(usuarioId),
    ]);

    return { datos, total, pagina, noLeidas };
  }

  async marcarLeida(id: string, usuarioId: string): Promise<NotificacionLeida> {
    const notificacion = await this.repository.marcarLeida(id, usuarioId);
    if (notificacion === null) {
      throw new NotFoundException('Notificación no encontrada.');
    }
    return notificacion;
  }

  private async resolverDestinatarios(
    aviso: Aviso,
  ): Promise<DestinatarioResuelto[]> {
    if ('usuarioId' in aviso.destinatario) {
      // Usuario inexistente o inactivo: se omite
      return this.repository.resolverUsuarioActivo(
        aviso.destinatario.usuarioId as string,
      );
    }
    return this.repository.resolverGrupoActivo(
      aviso.destinatario.rol,
      aviso.destinatario.sucursalId,
    );
  }

  private validarAviso(aviso: Aviso): Aviso {
    if (aviso?.destinatario === undefined || aviso.destinatario === null) {
      throw new ValidacionAvisoError('destinatario', 'Falta el destinatario');
    }

    const destinatario = aviso.destinatario as Record<string, unknown>;
    const tieneUsuario = Object.hasOwn(destinatario, 'usuarioId');
    const tieneRol = Object.hasOwn(destinatario, 'rol');
    const tieneSucursal = Object.hasOwn(destinatario, 'sucursalId');
    const formaUsuario = tieneUsuario && !tieneRol && !tieneSucursal;
    const formaGrupo = !tieneUsuario && tieneRol && tieneSucursal;

    if (!formaUsuario && !formaGrupo) {
      throw new ValidacionAvisoError(
        'destinatario',
        'El destinatario debe indicar solo usuarioId o rol y sucursalId',
      );
    }

    if (formaUsuario && !this.esUuid(destinatario.usuarioId)) {
      throw new ValidacionAvisoError(
        'destinatario.usuarioId',
        'El usuarioId debe ser un UUID válido',
      );
    }

    if (
      formaGrupo &&
      (!Object.values(Rol).includes(destinatario.rol as Rol) ||
        !Number.isInteger(destinatario.sucursalId) ||
        (destinatario.sucursalId as number) <= 0)
    ) {
      throw new ValidacionAvisoError(
        'destinatario',
        'El grupo destinatario debe tener un rol válido y una sucursalId entera positiva',
      );
    }

    if (typeof aviso.titulo !== 'string' || aviso.titulo.trim().length === 0) {
      throw new ValidacionAvisoError('titulo', 'Falta el título');
    }
    const titulo = aviso.titulo.trim();
    if (titulo.length > 100) {
      throw new ValidacionAvisoError(
        'titulo',
        'El título no puede superar los 100 caracteres',
      );
    }

    if (
      typeof aviso.mensaje !== 'string' ||
      aviso.mensaje.trim().length === 0
    ) {
      throw new ValidacionAvisoError('mensaje', 'Falta el mensaje');
    }
    if (aviso.mensaje.length > 500) {
      throw new ValidacionAvisoError(
        'mensaje',
        'El mensaje no puede superar los 500 caracteres',
      );
    }

    if (!Object.values(ModuloOrigen).includes(aviso.moduloOrigen)) {
      throw new ValidacionAvisoError(
        'moduloOrigen',
        'El módulo de origen no es válido',
      );
    }

    if (aviso.referencia !== undefined) {
      if (
        aviso.referencia === null ||
        typeof aviso.referencia !== 'object' ||
        typeof aviso.referencia.tipo !== 'string' ||
        aviso.referencia.tipo.length === 0 ||
        typeof aviso.referencia.id !== 'string' ||
        aviso.referencia.id.length === 0
      ) {
        throw new ValidacionAvisoError(
          'referencia',
          'La referencia debe incluir tipo e id',
        );
      }
      if (aviso.referencia.tipo.length > 40) {
        throw new ValidacionAvisoError(
          'referencia.tipo',
          'El tipo de referencia no puede superar los 40 caracteres',
        );
      }
      if (aviso.referencia.id.length > 64) {
        throw new ValidacionAvisoError(
          'referencia.id',
          'El id de referencia no puede superar los 64 caracteres',
        );
      }
    }

    if (
      aviso.enviarCorreo !== undefined &&
      typeof aviso.enviarCorreo !== 'boolean'
    ) {
      throw new ValidacionAvisoError(
        'enviarCorreo',
        'enviarCorreo debe ser booleano',
      );
    }

    return { ...aviso, titulo, enviarCorreo: aviso.enviarCorreo ?? false };
  }

  private esUuid(valor: unknown): valor is string {
    return (
      typeof valor === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        valor,
      )
    );
  }

  private async procesarCorreos(ids: string[]): Promise<void> {
    try {
      const notificaciones = await this.repository.buscarCreadasParaCorreo(ids);
      await Promise.all(
        notificaciones.map((notificacion) =>
          this.enviarConReintentos(notificacion),
        ),
      );
    } catch (error) {
      this.logger.error(
        'No se pudo procesar la cola de correos de notificaciones',
        error,
      );
    }
  }

  private async enviarConReintentos(notificacion: {
    id: string;
    email: string;
    titulo: string;
    mensaje: string;
  }): Promise<void> {
    for (let intento = 1; intento <= MAXIMO_INTENTOS_CORREO; intento += 1) {
      if (intento > 1) {
        await this.esperarReintento(this.retrasoReintentoCorreoMs);
      }

      try {
        await this.enviadorCorreo.enviar({
          para: notificacion.email,
          asunto: notificacion.titulo,
          cuerpo: notificacion.mensaje,
        });
        try {
          await this.repository.registrarIntentoCorreo(
            notificacion.id,
            EstadoCorreo.ENVIADO,
          );
        } catch (persistenciaError) {
          // El correo ya salió: no reenviar
          this.logger.error(
            'No se pudo actualizar el estado del correo',
            persistenciaError,
          );
        }
        return;
      } catch {
        const ultimoIntento = intento === MAXIMO_INTENTOS_CORREO;
        try {
          await this.repository.registrarIntentoCorreo(
            notificacion.id,
            ultimoIntento ? EstadoCorreo.FALLIDO : undefined,
          );
        } catch (persistenciaError) {
          this.logger.error(
            'No se pudo actualizar el estado del correo',
            persistenciaError,
          );
        }
        if (ultimoIntento) {
          this.logger.warn(
            `Falló el correo de la notificación ${notificacion.id}`,
          );
        }
      }
    }
  }
}
