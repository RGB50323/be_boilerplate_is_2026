import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { IS_PUBLIC_KEY, ROLES_KEY } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';

function contexto(user: Partial<User> | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function metadata(values: Record<string, unknown>) {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
      (key: unknown) => values[key as string],
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deja pasar una ruta sin @Roles', () => {
    metadata({});
    expect(guard.canActivate(contexto({ rol: Rol.CLIENTE }))).toBe(true);
  });

  it('deja pasar una ruta pública', () => {
    metadata({ [IS_PUBLIC_KEY]: true, [ROLES_KEY]: [Rol.COCINA] });
    expect(guard.canActivate(contexto(undefined))).toBe(true);
  });

  it('deja pasar un rol permitido', () => {
    metadata({ [ROLES_KEY]: [Rol.COCINA, Rol.GERENTE] });
    expect(guard.canActivate(contexto({ rol: Rol.GERENTE }))).toBe(true);
  });

  it('responde 403 a un rol no permitido', () => {
    metadata({ [ROLES_KEY]: [Rol.COCINA] });
    expect(() => guard.canActivate(contexto({ rol: Rol.CLIENTE }))).toThrow(ForbiddenException);
  });
});
