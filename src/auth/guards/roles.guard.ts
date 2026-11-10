import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '@PrismaClient';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';

export const ROLES_KEY = 'roles';

/**
 * Deja pasar solo a los usuarios cuyo rol está en la lista de @Roles().
 *
 * Corre después de JwtAuthGuard (que es global), así que el usuario ya viene
 * cargado en el request y releído de la base: un cambio de rol aplica en la
 * siguiente request, sin esperar a que expire el token.
 *
 * No se registra como guard global: lo aplica el propio decorador @Roles(),
 * para que sea imposible marcar roles en una ruta y olvidarse del guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !roles.includes(user.rol)) {
      throw new ForbiddenException(
        'No tenés permisos para acceder a este recurso.',
      );
    }
    return true;
  }
}
