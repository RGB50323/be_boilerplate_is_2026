import { EstadoPedido, Rol } from '@PrismaClient';

export const ROLES_COCINA: readonly Rol[] = [
  Rol.COCINA,
  Rol.GERENTE,
  Rol.GERENTE_GENERAL,
];

export const ESTADOS_EN_COCINA: readonly EstadoPedido[] = [
  EstadoPedido.RECIBIDO,
  EstadoPedido.ENVIADO_COCINA,
  EstadoPedido.EN_PREPARACION,
];

export const COCINA_NAMESPACE = '/cocina';

export function salaSucursal(sucursalId: number): string {
  return `sucursal:${sucursalId}`;
}
