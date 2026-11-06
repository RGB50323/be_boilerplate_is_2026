import { EstadoPedido, Rol } from '@PrismaClient';

/** Roles que pueden ver la cola de cocina, por HTTP y por WebSocket. */
export const ROLES_COCINA: readonly Rol[] = [
  Rol.COCINA,
  Rol.GERENTE,
  Rol.GERENTE_GENERAL,
];

/**
 * Estados en los que un pedido está en manos de cocina.
 *
 * Un pedido para llevar sin pago confirmado nunca llega a estos estados: se
 * queda en PENDIENTE_PAGO hasta que el pago se confirma. Ver el comentario en
 * PedidoCocinaRepository.
 */
export const ESTADOS_EN_COCINA: readonly EstadoPedido[] = [
  EstadoPedido.ENVIADO_COCINA,
  EstadoPedido.EN_PREPARACION,
];

/** Namespace de Socket.IO del tablero de cocina. */
export const COCINA_NAMESPACE = '/cocina';

/** Room de Socket.IO a la que se une cada conexión de una sucursal. */
export function salaSucursal(sucursalId: number): string {
  return `sucursal:${sucursalId}`;
}
