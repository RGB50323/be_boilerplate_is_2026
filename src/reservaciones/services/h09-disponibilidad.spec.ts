import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReservacionRepository } from '@Reservaciones/repositories';
import { ConsultarDisponibilidadDto } from '@Reservaciones/dto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservacionesService } from './reservaciones.service.js';

// H09. Consultar la disponibilidad de mesas (backend).
// AC4 (mensaje sin mesas) y AC5 (actualizar al cambiar datos) se prueban en el
// frontend: test/h09-disponibilidad.test.tsx.

const horario = {
  diaSemana: 1,
  apertura: new Date('1970-01-01T08:00:00Z'),
  cierre: new Date('1970-01-01T21:00:00Z'),
};

describe('H09. Consultar la disponibilidad de mesas', () => {
  const findMany = vi.fn();
  const repo = new ReservacionRepository({ mesa: { findMany } } as never);
  let service: ReservacionesService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    findMany
      .mockReset()
      .mockResolvedValue([{ id: 3, numero: 3, capacidad: 4, zona: 'Salón' }]);
    vi.spyOn(repo, 'findSucursalConHorario').mockResolvedValue({
      id: 1,
      horarios: [horario],
    } as never);
    service = new ReservacionesService(repo, {} as never);
  });

  afterEach(() => vi.useRealTimers());

  it('AC1: solo mesas activas de la sucursal, con capacidad suficiente y sin reservación confirmada que se cruce', async () => {
    const mesas = await service.consultarDisponibilidad(1, {
      fecha: '2026-11-23',
      hora: '19:00',
      personas: 4,
    });

    const { where } = findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      sucursalId: 1,
      activa: true,
      capacidad: { gte: 4 },
    });
    expect(where.reservaciones.none).toMatchObject({
      estado: 'CONFIRMADA',
      inicio: { lt: new Date('2026-11-24T03:00:00.000Z') },
      fin: { gt: new Date('2026-11-24T01:00:00.000Z') },
    });
    expect(mesas).toEqual([
      { mesaId: 3, numero: 3, capacidad: 4, zona: 'Salón' },
    ]);
  });

  it('AC2: una fecha u hora pasada, o fuera del horario de atención, no es válida', async () => {
    await expect(
      service.consultarDisponibilidad(1, {
        fecha: '2026-11-20',
        hora: '19:00',
        personas: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.consultarDisponibilidad(1, {
        fecha: '2026-11-23',
        hora: '20:00',
        personas: 2,
      }),
    ).rejects.toThrow(/Horario no válido/);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('AC3: con menos de 1 persona no permite la búsqueda', async () => {
    const dto = plainToInstance(ConsultarDisponibilidadDto, {
      fecha: '2026-11-23',
      hora: '19:00',
      personas: 0,
    });
    const errores = await validate(dto);

    expect(errores.map((e) => e.property)).toEqual(['personas']);
    expect(JSON.stringify(errores)).toContain('personas debe ser al menos 1.');
  });
});
