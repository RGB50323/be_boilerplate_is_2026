import type { Rol } from '@PrismaClient';

/**
 * Payload que viaja dentro del JWT de acceso.
 *
 * `rol` y `sucursalId` le sirven al frontend para decidir qué vistas mostrar.
 * El backend no autoriza con estos claims: los guards releen el usuario en
 * cada request, así un cambio de rol o de sucursal aplica al instante.
 */
export interface AccessTokenPayload {
  /** ID del usuario (claim estándar `sub`). */
  sub: string;
  email: string;
  rol: Rol;
  sucursalId: number | null;
}

/** Par de tokens devuelto por login y refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Vigencia del access token, en segundos. */
  expiresIn: number;
}
