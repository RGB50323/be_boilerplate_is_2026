import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '@PrismaClient';
import { RolesGuard } from './roles.guard.js';

function contexto(user?: { rol: Rol }) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const exigir = (roles: Rol[] | undefined) =>
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deja pasar si la ruta no exige roles', () => {
    exigir(undefined);
    expect(guard.canActivate(contexto({ rol: Rol.CLIENTE }))).toBe(true);
  });

  it('deja pasar a un usuario con el rol exigido', () => {
    exigir([Rol.GERENTE]);
    expect(guard.canActivate(contexto({ rol: Rol.GERENTE }))).toBe(true);
  });

  it('acepta cualquiera de los roles permitidos', () => {
    exigir([Rol.GERENTE, Rol.GERENTE_GENERAL]);
    expect(guard.canActivate(contexto({ rol: Rol.GERENTE_GENERAL }))).toBe(
      true,
    );
  });

  it.each([Rol.CLIENTE, Rol.MESERO, Rol.COCINA, Rol.GERENTE_GENERAL])(
    'rechaza con 403 al rol %s cuando solo se permite GERENTE',
    (rol) => {
      exigir([Rol.GERENTE]);
      expect(() => guard.canActivate(contexto({ rol }))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('rechaza con 403 si el request no trae usuario', () => {
    exigir([Rol.GERENTE]);
    expect(() => guard.canActivate(contexto(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
