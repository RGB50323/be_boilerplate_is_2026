import { SetMetadata } from '@nestjs/common';
import type { Rol } from '@PrismaClient';

export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta (o un controlador entero) a los roles indicados.
 *
 * Lo aplica RolesGuard, que corre después de JwtAuthGuard. Una ruta sin este
 * decorador queda abierta a cualquier usuario autenticado.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
