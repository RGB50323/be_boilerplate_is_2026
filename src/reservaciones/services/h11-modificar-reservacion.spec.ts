import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MesaNoDisponibleError } from '@Reservaciones/repositories';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdicionReservacionService } from './edicion-reservacion.service.js';

// H11. Modificar reservación de mesa.

const horarios = Array.from({ length: 7 }, (_, diaSemana) => ({
  diaSemana,
  apertura: new Date('1970-01-01T08:00:00Z'),
  cierre: new Date('1970-01-01T21:00:00Z'),
}));

const reserva = (extra: Record<string, unknown> = {}) => ({
  id: 45,
  estado: 'CONFIRMADA',
  mesaId: 3,
  personas: 2,
  inicio: new Date('2026-11-24T01:00:00Z'),
  fin: new Date('2026-11-24T03:00:00Z'),
  creadaEn: new Date('2026-11-01T00:00:00Z'),
  modificadaEn: null,
  mesa: {
    numero: 2,
    sucursalId: 1,
    capacidad: 4,
    sucursal: { nombre: 'Centro', horarios },
  },
  ...extra,
});

const cambio = (extra: Record<string, unknown> = {}) => ({
  mesaId: 3,
  fecha: '2026-11-25',
  hora: '18:00',
  personas: 4,
  version: '2026-11-01T00:00:00.000Z',
  ...extra,
});

describe('H11. Modificar reservación de mesa', () => {
  const repo = {
    buscar: vi.fn(),
    editar: vi.fn(),
    mesa: vi.fn(),
    guardar: vi.fn(),
  };
  const avisos = { registrarModificada: vi.fn(), enviarCorreos: vi.fn() };
  const disponibilidad = { findMesasDisponibles: vi.fn() };
  let service: EdicionReservacionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    [
      ...Object.values(repo),
      ...Object.values(avisos),
      disponibilidad.findMesasDisponibles,
    ].forEach((f) => f.mockReset());
    repo.buscar.mockResolvedValue(reserva());
    repo.editar.mockImplementation(async (_id, _cliente, operacion) =>
      operacion(reserva(), {}),
    );
    repo.mesa.mockResolvedValue({
      id: 3,
      activa: true,
      sucursalId: 1,
      capacidad: 4,
    });
    avisos.registrarModificada.mockResolvedValue(['ana@example.com']);
    service = new EdicionReservacionService(
      repo as never,
      avisos as never,
      disponibilidad as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('AC1: muestra los datos actuales de una reservación confirmada del cliente', async () => {
    const detalle = await service.detalle('R-000045', 'cliente-1');

    expect(repo.buscar).toHaveBeenCalledWith(45, 'cliente-1');
    expect(detalle).toMatchObject({
      reservacionId: 'R-000045',
      estado: 'CONFIRMADA',
      fecha: '2026-11-23',
      hora: '19:00',
      personas: 2,
      capacidad: 4,
    });
  });

  it('AC2: con una mesa disponible que cumple, guarda la nueva fecha, hora y personas', async () => {
    repo.guardar.mockImplementation(async (_id, d) =>
      reserva({ ...d, modificadaEn: d.modificadaEn }),
    );

    const r = await service.modificar('R-000045', 'cliente-1', cambio());

    expect(repo.guardar.mock.calls[0][1]).toMatchObject({
      mesaId: 3,
      personas: 4,
      inicio: new Date('2026-11-26T00:00:00.000Z'),
    });
    expect(r).toMatchObject({
      fecha: '2026-11-25',
      hora: '18:00',
      personas: 4,
    });
  });

  it('AC3: rechaza fecha pasada, horario fuera de atención o más personas que la capacidad, con el motivo', async () => {
    await expect(
      service.modificar('R-000045', 'c', cambio({ fecha: '2026-11-20' })),
    ).rejects.toThrow(/pasado/);
    await expect(
      service.modificar('R-000045', 'c', cambio({ hora: '20:00' })),
    ).rejects.toThrow(/Horario no válido/);
    await expect(
      service.modificar('R-000045', 'c', cambio({ personas: 6 })),
    ).rejects.toThrow(
      'La cantidad de personas supera la capacidad de la mesa.',
    );
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('AC4: si la mesa no está disponible conserva los datos originales y ofrece mesas alternativas', async () => {
    repo.guardar.mockRejectedValue(new MesaNoDisponibleError());
    await expect(service.modificar('R-000045', 'c', cambio())).rejects.toThrow(
      new ConflictException({
        message:
          'La mesa ya no está disponible. Tus datos originales se conservaron; elegí otra mesa.',
        codigo: 'MESA_NO_DISPONIBLE',
      }),
    );

    disponibilidad.findMesasDisponibles.mockResolvedValue([
      { id: 7, numero: 7, capacidad: 6, zona: 'Terraza' },
    ]);
    await expect(
      service.alternativas('R-000045', 'c', {
        fecha: '2026-11-25',
        hora: '18:00',
        personas: 4,
      }),
    ).resolves.toEqual([
      { mesaId: 7, numero: 7, capacidad: 6, zona: 'Terraza' },
    ]);
    expect(
      disponibilidad.findMesasDisponibles.mock.calls[0][0].excluirReservacionId,
    ).toBe(45);
  });

  it('AC5: no permite modificar una reservación cancelada o de otro cliente', async () => {
    repo.editar.mockImplementation(async (_id, _c, op) =>
      op(reserva({ estado: 'CANCELADA' }), {}),
    );
    await expect(service.modificar('R-000045', 'c', cambio())).rejects.toThrow(
      new BadRequestException(
        'Solo podés modificar una reservación confirmada.',
      ),
    );

    repo.editar.mockImplementation(async (_id, _c, op) => op(null, {}));
    await expect(
      service.modificar('R-000045', 'otro', cambio()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('AC6: al modificar, registra el aviso con los datos nuevos y envía el correo (H26)', async () => {
    const actualizada = reserva({
      personas: 4,
      modificadaEn: new Date('2026-11-21T12:00:00Z'),
    });
    repo.guardar.mockResolvedValue(actualizada);

    await service.modificar('R-000045', 'cliente-1', cambio());

    expect(avisos.registrarModificada).toHaveBeenCalledWith(actualizada, {});
    expect(avisos.enviarCorreos).toHaveBeenCalledWith(['ana@example.com']);
  });
});
