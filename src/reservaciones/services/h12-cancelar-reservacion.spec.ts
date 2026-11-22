import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OcupacionEvento } from '../../ocupacion/events/ocupacion.events.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelacionReservacionService } from './cancelacion-reservacion.service.js';

// H12. Cancelar reservación de mesa (backend).
// AC1 (confirmación con los datos) y AC2 (conservar sin cambios) se prueban en el
// frontend: test/h12-cancelar-reservacion.test.tsx.

const reserva = (estado = 'CONFIRMADA') => ({
  id: 45,
  estado,
  mesaId: 3,
  personas: 2,
  inicio: new Date('2026-11-24T01:00:00Z'),
  creadaEn: new Date('2026-11-01T00:00:00Z'),
  modificadaEn: null,
  mesa: { numero: 2, sucursalId: 1, sucursal: { nombre: 'Centro' } },
});

describe('H12. Cancelar reservación de mesa', () => {
  const repo = { editar: vi.fn(), cancelar: vi.fn() };
  const avisos = { registrarCancelada: vi.fn(), enviarCorreos: vi.fn() };
  const emitter = { emit: vi.fn() };
  let service: CancelacionReservacionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    [...Object.values(repo), ...Object.values(avisos), emitter.emit].forEach(
      (f) => f.mockReset(),
    );
    repo.editar.mockImplementation(async (_id, _c, op) => op(reserva(), {}));
    repo.cancelar.mockResolvedValue(reserva('CANCELADA'));
    avisos.registrarCancelada.mockResolvedValue(['ana@example.com']);
    service = new CancelacionReservacionService(
      repo as never,
      avisos as never,
      emitter as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('AC3: al confirmar, la reservación pasa a “Cancelada” y se libera la mesa en ese horario', async () => {
    const r = await service.cancelar('R-000045', 'cliente-1');

    expect(repo.editar.mock.calls[0].slice(0, 2)).toEqual([45, 'cliente-1']);
    expect(r).toMatchObject({ reservacionId: 'R-000045', estado: 'CANCELADA' });
    expect(emitter.emit).toHaveBeenCalledWith(
      OcupacionEvento.RESERVACION_CAMBIADA,
      {
        sucursalId: 1,
        fecha: '2026-11-23',
      },
    );
  });

  it('AC4: no cancela una reservación ya cancelada o de otro cliente', async () => {
    repo.editar.mockImplementation(async (_id, _c, op) =>
      op(reserva('CANCELADA'), {}),
    );
    await expect(service.cancelar('R-000045', 'cliente-1')).rejects.toThrow(
      new BadRequestException('La reservación ya está cancelada.'),
    );

    repo.editar.mockImplementation(async (_id, _c, op) => op(null, {}));
    await expect(service.cancelar('R-000045', 'otro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.cancelar).not.toHaveBeenCalled();
  });

  it('AC5: al cancelar registra el aviso y envía el correo (H26)', async () => {
    await service.cancelar('R-000045', 'cliente-1');

    expect(avisos.registrarCancelada).toHaveBeenCalledWith(
      reserva('CANCELADA'),
      {},
    );
    expect(avisos.enviarCorreos).toHaveBeenCalledWith(['ana@example.com']);
  });
});
