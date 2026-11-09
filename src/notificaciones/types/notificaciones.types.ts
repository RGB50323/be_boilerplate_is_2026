import type { ModuloOrigen, Rol } from '@PrismaClient';

export type DestinatarioAviso =
  | { usuarioId: string; rol?: never; sucursalId?: never }
  | { usuarioId?: never; rol: Rol; sucursalId: number };

export interface ReferenciaAviso {
  tipo: string;
  id: string;
}

export interface Aviso {
  destinatario: DestinatarioAviso;
  titulo: string;
  mensaje: string;
  moduloOrigen: ModuloOrigen;
  referencia?: ReferenciaAviso;
  enviarCorreo?: boolean;
}

export interface ResultadoNotificacion {
  registradas: number;
  omitidasPorDuplicado: number;
}

export interface DestinatarioResuelto {
  id: string;
  email: string;
}

export interface NotificacionCreadaParaCorreo {
  id: string;
  email: string;
  titulo: string;
  mensaje: string;
}

export interface NotificacionListado {
  id: string;
  titulo: string;
  mensaje: string;
  moduloOrigen: ModuloOrigen;
  referenciaTipo: string | null;
  referenciaId: string | null;
  leida: boolean;
  creadaEn: Date;
}

export interface NotificacionLeida {
  id: string;
  leida: boolean;
  leidaEn: Date | null;
}

export interface MensajeCorreo {
  para: string;
  asunto: string;
  cuerpo: string;
}

export interface EnviadorCorreo {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}

export type EsperarReintentoCorreo = (milisegundos: number) => Promise<void>;

export const ENVIADOR_CORREO = Symbol('ENVIADOR_CORREO');
export const ESPERAR_REINTENTO_CORREO = Symbol('ESPERAR_REINTENTO_CORREO');
export const RETRASO_REINTENTO_CORREO_MS = Symbol(
  'RETRASO_REINTENTO_CORREO_MS',
);
