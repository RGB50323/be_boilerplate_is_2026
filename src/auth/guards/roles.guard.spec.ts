import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol, type User } from '@PrismaClient';
import { RolesGuard } from './roles.guard.js';

function contexto(user?: Partial<User>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('deja pasar si la ruta no declara roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contexto({ rol: Rol.CLIENTE }))).toBe(true);
  });

  it('deja pasar al usuario con uno de los roles permitidos', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      Rol.GERENTE_GENERAL,
    ]);
    expect(guard.canActivate(contexto({ rol: Rol.GERENTE_GENERAL }))).toBe(true);
  });

  it.each([Rol.CLIENTE, Rol.MESERO, Rol.COCINA, Rol.GERENTE])(
    'responde 403 a %s en una ruta solo para gerente general',
    (rol) => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        Rol.GERENTE_GENERAL,
      ]);
      expect(() => guard.canActivate(contexto({ rol }))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('responde 403 si no hay usuario en el request', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      Rol.GERENTE_GENERAL,
    ]);
    expect(() => guard.canActivate(contexto())).toThrow(ForbiddenException);
  });
});
