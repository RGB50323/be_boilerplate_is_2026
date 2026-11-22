import { readFileSync } from 'node:fs';
import { ValidacionAvisoError } from '@Notificaciones/errors';
import { NotificacionRepository } from '@Notificaciones/repositories';
import type { Aviso } from '@Notificaciones/types';
import { ModuloOrigen, Rol } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificacionesService } from './notificaciones.service.js';

// H27. Avisar a usuarios desde cualquier módulo.

const USUARIO = '9f3dd0b4-843f-44e5-a94f-a574f89a4d33';

const aviso = (extra: Partial<Aviso> = {}): Aviso => ({
  destinatario: { usuarioId: USUARIO },
  titulo: 'Pedido listo',
  mensaje: 'Tu pedido ya está listo.',
  moduloOrigen: ModuloOrigen.PEDIDOS,
  referencia: { tipo: 'pedido', id: '123' },
  ...extra,
});

describe('H27. Avisar a usuarios desde cualquier módulo', () => {
  const prisma = {
    user: { findMany: vi.fn() },
    notificacion: { createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  };
  let service: NotificacionesService;

  beforeEach(() => {
    prisma.user.findMany
      .mockReset()
      .mockResolvedValue([{ id: USUARIO, email: 'a@example.com' }]);
    prisma.notificacion.createMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.notificacion.findMany.mockReset().mockResolvedValue([]);
    prisma.notificacion.count.mockReset().mockResolvedValue(0);
    const repo = new NotificacionRepository(prisma as never);
    vi.spyOn(repo, 'resolverUsuarioActivo').mockResolvedValue([
      { id: USUARIO, email: 'a@example.com' },
    ] as never);
    service = new NotificacionesService(repo, { enviar: vi.fn() }, vi.fn(), 0);
  });

  it('AC1: registra el aviso para el destinatario con título, mensaje, módulo y fecha, como no leído', async () => {
    await expect(service.notificar(aviso())).resolves.toEqual({
      registradas: 1,
      omitidasPorDuplicado: 0,
    });

    expect(
      prisma.notificacion.createMany.mock.calls[0][0].data[0],
    ).toMatchObject({
      destinatarioId: USUARIO,
      titulo: 'Pedido listo',
      mensaje: 'Tu pedido ya está listo.',
      moduloOrigen: 'PEDIDOS',
    });
    const modelo = readFileSync('prisma/schema.prisma', 'utf8').split(
      'model Notificacion {',
    )[1];
    expect(modelo).toMatch(/leida\s+Boolean\s+@default\(false\)/);
    expect(modelo).toMatch(/creadaEn\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('AC2: un aviso a un rol de una sucursal llega a cada usuario activo de ese rol y sucursal', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'g1', email: 'g1@example.com' },
      { id: 'g2', email: 'g2@example.com' },
    ]);
    prisma.notificacion.createMany.mockResolvedValue({ count: 2 });

    await service.notificar(
      aviso({ destinatario: { rol: Rol.GERENTE, sucursalId: 1 } }),
    );

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      rol: Rol.GERENTE,
      sucursalId: 1,
      isActive: true,
    });
    expect(
      prisma.notificacion.createMany.mock.calls[0][0].data.map(
        (n: { destinatarioId: string }) => n.destinatarioId,
      ),
    ).toEqual(['g1', 'g2']);
  });

  it('AC3: sin destinatario o sin título no se registra y devuelve el error', async () => {
    await expect(
      service.notificar(aviso({ destinatario: undefined as never })),
    ).rejects.toThrow('Falta el destinatario');
    await expect(service.notificar(aviso({ titulo: '' }))).rejects.toThrow(
      'Falta el título',
    );
    await expect(
      service.notificar(aviso({ titulo: '' })),
    ).rejects.toBeInstanceOf(ValidacionAvisoError);
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('AC4: un título de más de 100, un mensaje de más de 500 o un módulo fuera de la lista no se registra', async () => {
    await expect(
      service.notificar(aviso({ titulo: 't'.repeat(101) })),
    ).rejects.toThrow(ValidacionAvisoError);
    await expect(
      service.notificar(aviso({ mensaje: 'm'.repeat(501) })),
    ).rejects.toThrow(ValidacionAvisoError);
    await expect(
      service.notificar(aviso({ moduloOrigen: 'OTRO' as ModuloOrigen })),
    ).rejects.toThrow(ValidacionAvisoError);
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('AC5: el mismo módulo, referencia y destinatario no genera un duplicado', async () => {
    prisma.notificacion.createMany.mockResolvedValue({ count: 0 });

    await expect(service.notificar(aviso())).resolves.toEqual({
      registradas: 0,
      omitidasPorDuplicado: 1,
    });
    expect(prisma.notificacion.createMany.mock.calls[0][0].skipDuplicates).toBe(
      true,
    );
  });

  it('AC6: el historial solo trae los avisos dirigidos al usuario', async () => {
    await service.listar(USUARIO, 1);

    expect(prisma.notificacion.findMany.mock.calls[0][0].where).toEqual({
      destinatarioId: USUARIO,
    });
  });
});
