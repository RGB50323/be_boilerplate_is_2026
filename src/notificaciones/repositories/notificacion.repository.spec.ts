import { Rol } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { NotificacionRepository } from './notificacion.repository.js';

describe('NotificacionRepository', () => {
  it('filtra el grupo por rol, sucursal y usuarios activos', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const repository = new NotificacionRepository(prisma);

    await repository.resolverGrupoActivo(Rol.MESERO, 9);

    expect(findMany).toHaveBeenCalledWith({
      where: { rol: Rol.MESERO, sucursalId: 9, isActive: true },
      select: { id: true, email: true },
    });
  });

  it('devuelve una notificación ya leída sin cambiar su fecha', async () => {
    const leidaEn = new Date('2026-11-07T15:00:00.000Z');
    const existente = {
      id: '34ddfbee-dde1-43ed-8066-f9d6a89e8462',
      leida: true,
      leidaEn,
    };
    const findFirst = vi.fn().mockResolvedValue(existente);
    const update = vi.fn();
    const prisma = {
      notificacion: { findFirst, update },
    } as unknown as PrismaService;
    const repository = new NotificacionRepository(prisma);

    await expect(
      repository.marcarLeida(
        existente.id,
        '9f3dd0b4-843f-44e5-a94f-a574f89a4d33',
      ),
    ).resolves.toEqual(existente);
    expect(update).not.toHaveBeenCalled();
  });
});
