import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { TokenService } from '@Auth/services';
import type { RefreshTokenRepository } from '@Auth/repositories';
import { Rol, type User } from '@PrismaClient';
import type { EnvConfig } from '@Config';

describe('TokenService', () => {
  it('firma el access token con rol y sucursalId del usuario', async () => {
    const signAsync = vi.fn().mockResolvedValue('jwt');
    const jwtService = {
      signAsync,
      verifyAsync: vi.fn().mockResolvedValue({ iat: 0, exp: 900 }),
    } as unknown as JwtService;
    const config = { get: () => 7 } as unknown as ConfigService<EnvConfig, true>;
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
