import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Rol, type User } from '@PrismaClient';
import { ROLES_KEY } from '@Auth/decorators';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OcupacionController } from '../controllers/ocupacion.controller.js';
import { OcupacionGateway } from '../gateways/ocupacion.gateway.js';
import { OcupacionRepository } from '../repositories/ocupacion.repository.js';
import { OcupacionService } from './ocupacion.service.js';

// H13. Ocupación proyectada del salón.

const gerente = { id: 'g1', rol: Rol.GERENTE, sucursalId: 1 } as User;
const local = (fecha: string, hora: string) =>
  new Date(`${fecha}T${hora}:00-06:00`);

function sucursal(mesas = 4) {
  return {
    id: 1,
    nombre: 'Centro',
    _count: { mesas },
    horarios: [
      {
        apertura: new Date('1970-01-01T18:00:00Z'),
        cierre: new Date('1970-01-01T21:00:00Z'),
      },
    ],
  };
}

describe('H13. Ocupación proyectada del salón', () => {
  const prisma = {
    sucursal: { findUnique: vi.fn() },
    reservacion: { findMany: vi.fn() },
  };
  let service: OcupacionService;

  beforeEach(() => {
    prisma.sucursal.findUnique.mockReset().mockResolvedValue(sucursal());
    prisma.reservacion.findMany.mockReset().mockResolvedValue([]);
    service = new OcupacionService(new OcupacionRepository(prisma as never));
  });

  it('AC1: muestra la ocupación de la fecha elegida por bloques de una hora', async () => {
    const r = await service.consultar(1, '2026-11-23', gerente);

    expect(r.bloques.map((b) => `${b.horaInicio}-${b.horaFin}`)).toEqual([
      '18:00-19:00',
      '19:00-20:00',
      '20:00-21:00',
    ]);
  });

  it('AC2: por bloque da mesas reservadas, disponibles y el porcentaje sobre las mesas activas', async () => {
    prisma.reservacion.findMany.mockResolvedValue([
      {
        mesaId: 1,
        inicio: local('2026-11-23', '18:00'),
        fin: local('2026-11-23', '20:00'),
      },
    ]);

    const { bloques } = await service.consultar(1, '2026-11-23', gerente);

    expect(bloques[0]).toMatchObject({
      mesasReservadas: 1,
      mesasDisponibles: 3,
      porcentajeOcupacion: 25,
    });
    expect(prisma.sucursal.findUnique.mock.calls[0][0].select._count).toEqual({
      select: { mesas: { where: { activa: true } } },
    });
  });

  it('AC3: solo cuentan reservaciones Confirmada y una mesa no se cuenta dos veces en el bloque', async () => {
    prisma.reservacion.findMany.mockResolvedValue([
      {
        mesaId: 1,
        inicio: local('2026-11-23', '18:00'),
        fin: local('2026-11-23', '18:30'),
      },
      {
        mesaId: 1,
        inicio: local('2026-11-23', '18:30'),
        fin: local('2026-11-23', '19:00'),
      },
    ]);

    const { bloques } = await service.consultar(1, '2026-11-23', gerente);

    expect(prisma.reservacion.findMany.mock.calls[0][0].where.estado).toBe(
      'CONFIRMADA',
    );
    expect(bloques[0].mesasReservadas).toBe(1);
  });

  it('AC4: un bloque sin reservaciones da 0 % y sin mesas activas no se puede calcular', async () => {
    expect(
      (await service.consultar(1, '2026-11-23', gerente)).bloques[0]
        .porcentajeOcupacion,
    ).toBe(0);

    prisma.sucursal.findUnique.mockResolvedValue(sucursal(0));
    const sinMesas = await service.consultar(1, '2026-11-23', gerente);
    expect(sinMesas.calculable).toBe(false);
    expect(sinMesas.bloques[0].porcentajeOcupacion).toBeNull();
  });

  it('AC5: un cambio de reservación se envía en vivo a la sala de la sucursal', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new OcupacionGateway({} as never);
    Object.assign(gateway, { server: { to } });

    gateway.emitirReservacionCambiada({ sucursalId: 1, fecha: '2026-11-23' });

    expect(to).toHaveBeenCalledWith('sucursal:1');
    expect(emit).toHaveBeenCalledWith('ocupacion:actualizada', {
      sucursalId: 1,
      fecha: '2026-11-23',
    });
  });

  it('AC6: solo el gerente de la sucursal puede consultar su ocupación', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, OcupacionController)).toEqual([
      Rol.GERENTE,
    ]);
    await expect(
      service.consultar(2, '2026-11-23', gerente),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sucursal.findUnique).not.toHaveBeenCalled();
  });
});
