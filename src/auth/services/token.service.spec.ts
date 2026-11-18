import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { TokenService } from '@Auth/services';
import type { RefreshTokenRepository } from '@Auth/repositories';
import { Rol, type User } from '@PrismaClient';
import type { EnvConfig } from '@Config';
import { UnauthorizedException } from '@nestjs/common';

describe('TokenService', () => {
  it('firma el access token con rol y sucursalId del usuario', async () => {
    const signAsync = vi.fn().mockResolvedValue('jwt');
    const jwtService = {
      signAsync,
      verifyAsync: vi.fn().mockResolvedValue({ iat: 0, exp: 900 }),
    } as unknown as JwtService;
    const config = { get: () => 7 } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const repository = { create: vi.fn() } as unknown as RefreshTokenRepository;
    const service = new TokenService(repository, jwtService, config);

    await service.issueTokenPair({
      id: 'u-1',
      email: 'cocina@example.com',
      rol: Rol.COCINA,
      sucursalId: 3,
    } as User);

    expect(signAsync).toHaveBeenCalledWith({
      sub: 'u-1',
      email: 'cocina@example.com',
      rol: Rol.COCINA,
      sucursalId: 3,
    });
  });
});

describe('rotate', () => {
  const usuario = {
    id: 'u-1',
    email: 'a@b.com',
    rol: Rol.COCINA,
    sucursalId: 1,
    isActive: true,
  } as User;

  function crear(consume: boolean) {
    const repository = {
      findByTokenHashWithUser: vi.fn().mockResolvedValue({
        id: 't-1',
        userId: 'u-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: usuario,
      }),
      consume: vi.fn().mockResolvedValue(consume),
      revokeAllForUser: vi.fn(),
      create: vi.fn(),
    };
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue('jwt'),
      verifyAsync: vi.fn().mockResolvedValue({ iat: 0, exp: 900 }),
    } as unknown as JwtService;
    const config = { get: () => 7 } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const service = new TokenService(
      repository as unknown as RefreshTokenRepository,
      jwtService,
      config,
    );
    return { service, repository };
  }

  it('canjea el token una sola vez y emite un par nuevo', async () => {
    const { service, repository } = crear(true);
    const resultado = await service.rotate('token');
    expect(repository.consume).toHaveBeenCalledWith('t-1');
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(resultado.tokens.accessToken).toBe('jwt');
  });

  it('si otra petición ya lo consumió, la rechaza sin revocar las sesiones', async () => {
    const { service, repository } = crear(false);
    await expect(service.rotate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repository.revokeAllForUser).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});
