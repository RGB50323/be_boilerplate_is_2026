import { readFileSync } from 'node:fs';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { RefreshTokenRepository } from '@Auth/repositories';
import { Rol, type User } from '@PrismaClient';
import { describe, expect, it, vi } from 'vitest';
import { CategoriasService } from '../../categorias/services/categorias.service.js';
import { PedidosRepository } from '../../pedidos/repositories/pedidos.repository.js';
import { PlatillosRepository } from '../../platillos/repositories/platillos.repository.js';
import { TokenService } from './token.service.js';

// H33. Correcciones finales de calidad y seguridad (backend).
// AC2, AC5 y AC6 se prueban en el frontend: test/h33-correcciones.test.ts.

describe('H33. Correcciones finales de calidad y seguridad', () => {
  it('AC1: el refresh token solo se puede usar una vez, incluso con peticiones simultáneas', async () => {
    let usado = false;
    const updateMany = vi.fn(async (_consulta: unknown) => {
      const count = usado ? 0 : 1;
      usado = true;
      return { count };
    });
    const repo = new RefreshTokenRepository({
      refreshToken: { updateMany },
    } as never);
    vi.spyOn(repo, 'findByTokenHashWithUser').mockResolvedValue({
      id: 't-1',
      userId: 'u-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u-1', rol: Rol.CLIENTE, isActive: true } as User,
    } as never);
    vi.spyOn(repo, 'create').mockResolvedValue({} as never);
    const jwt = {
      signAsync: vi.fn().mockResolvedValue('jwt'),
      verifyAsync: vi.fn().mockResolvedValue({ iat: 0, exp: 900 }),
    } as unknown as JwtService;
    const service = new TokenService(repo, jwt, {
      get: () => 7,
    } as unknown as ConfigService<never, true>);

    const resultados = await Promise.allSettled([
      service.rotate('token'),
      service.rotate('token'),
    ]);

    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 't-1', revokedAt: null },
    });
    expect(resultados.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const rechazo = resultados.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(UnauthorizedException);
  });

  it('AC3: habilitar o deshabilitar un platillo solo cambia la sucursal del gerente', async () => {
    const update = vi.fn().mockResolvedValue({});
    const repo = new PlatillosRepository({
      platilloSucursal: { update },
    } as never);

    await repo.deshabilitar(10, 1).catch(() => undefined);
    await repo.habilitar(10, 1).catch(() => undefined);

    for (const [llamada] of update.mock.calls) {
      expect(llamada.where).toEqual({
        platilloId_sucursalId: { platilloId: 10, sucursalId: 1 },
      });
    }
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('AC4: las imágenes subidas persisten (carpeta uploads con permisos y volumen en Docker)', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const compose = readFileSync('docker-compose.yml', 'utf8');
    expect(dockerfile).toMatch(/mkdir -p \/app\/uploads\/platillos/);
    expect(dockerfile).toMatch(/chown -R node:node \/app\/uploads/);
    expect(compose).toMatch(/uploads:\/app\/uploads/);
  });

  it('AC7: cambiar la categoría de un platillo valida la sucursal del gerente', async () => {
    const repo = {
      buscarPlatillo: vi.fn().mockResolvedValue({ id: 10, sucursales: [] }),
      asignarCategoria: vi.fn(),
    };
    const service = new CategoriasService(repo as never);

    await expect(
      service.cambiarCategoriaDePlatillo(10, 3, 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.buscarPlatillo).toHaveBeenCalledWith(10, 2);
    expect(repo.asignarCategoria).not.toHaveBeenCalled();
  });

  it('AC8: editar la cantidad de un ítem bloquea la fila para no descontar disponibilidad de más', () => {
    const fuente = readFileSync(
      'src/pedidos/repositories/pedidos.repository.ts',
      'utf8',
    );
    const cambiarItem = fuente.slice(fuente.indexOf('cambiarItem('));
    expect(cambiarItem.slice(0, 1500)).toMatch(/FOR UPDATE/);
    expect(PedidosRepository.prototype.cambiarItem).toBeTypeOf('function');
  });
});
