import { ModuloOrigen } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisosReservacionService } from './avisos-reservacion.service.js';
import { RecordatoriosReservacionService } from './recordatorios-reservacion.service.js';

// H26. Recibir la confirmación y el recordatorio de mi reservación.

const AHORA = new Date('2026-11-21T18:00:00Z');
const horas = (h: number) => new Date(AHORA.getTime() + h * 60 * 60_000);

const reservacion = {
  id: 45,
  clienteId: 'c-1',
  personas: 4,
  inicio: new Date('2026-11-24T01:00:00Z'),
  modificadaEn: null,
  mesa: { numero: 2, sucursal: { nombre: 'Centro' } },
};

describe('H26. Recibir la confirmación y el recordatorio de mi reservación', () => {
  const repo = {
    buscarParaAviso: vi.fn(),
    buscarRecordatoriosPendientes: vi.fn(),
    marcarRecordatorioEnviado: vi.fn(),
  };
  const notificaciones = { notificar: vi.fn() };
  let avisos: AvisosReservacionService;
  let recordatorios: RecordatoriosReservacionService;

  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    notificaciones.notificar.mockReset().mockResolvedValue({ registradas: 1 });
    repo.buscarParaAviso.mockResolvedValue(reservacion);
    avisos = new AvisosReservacionService(
      repo as never,
      notificaciones as never,
    );
    recordatorios = new RecordatoriosReservacionService(repo as never, avisos);
  });

  it('AC1: crear, modificar o cancelar avisa en la plataforma y por correo con fecha, hora, personas y sucursal', async () => {
    await avisos.creada(45);
    await avisos.modificada(45);
    await avisos.cancelada(45);

    const titulos = notificaciones.notificar.mock.calls.map(([a]) => a.titulo);
    expect(titulos).toEqual([
      'Reservación confirmada',
      'Reservación modificada',
      'Reservación cancelada',
    ]);
    expect(notificaciones.notificar.mock.calls[0][0]).toMatchObject({
      mensaje:
        'Tu reservación R-000045 quedó confirmada: 2026-11-23 a las 19:00, 4 personas, sucursal Centro, mesa 2.',
      moduloOrigen: ModuloOrigen.RESERVACIONES,
      enviarCorreo: true,
    });
  });

  it('AC2: una reservación confirmada recibe un recordatorio 2 horas antes', async () => {
    repo.buscarRecordatoriosPendientes.mockResolvedValue([
      { id: 45, inicio: horas(2), creadaEn: horas(-48), modificadaEn: null },
    ]);

    await expect(recordatorios.enviarPendientes(AHORA)).resolves.toBe(1);
    expect(repo.buscarRecordatoriosPendientes).toHaveBeenCalledWith(
      AHORA,
      horas(2),
    );
    expect(notificaciones.notificar.mock.calls[0][0].titulo).toBe(
      'Recordatorio de tu reservación',
    );
  });

  it('AC3: una reservación hecha con menos de 2 horas de anticipación no recibe recordatorio', async () => {
    repo.buscarRecordatoriosPendientes.mockResolvedValue([
      {
        id: 45,
        inicio: horas(1.5),
        creadaEn: horas(-0.25),
        modificadaEn: null,
      },
    ]);

    await expect(recordatorios.enviarPendientes(AHORA)).resolves.toBe(0);
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('AC4: al cambiar fecha u hora, el recordatorio usa la nueva hora', async () => {
    repo.buscarParaAviso.mockResolvedValue({
      ...reservacion,
      inicio: horas(2),
    });
    await avisos.recordatorio(45);
    repo.buscarParaAviso.mockResolvedValue({
      ...reservacion,
      inicio: horas(26),
    });
    await avisos.recordatorio(45);

    const [primera, segunda] = notificaciones.notificar.mock.calls.map(
      ([a]) => a.referencia.id,
    );
    expect(primera).toBe(`R-000045:${horas(2).getTime()}`);
    expect(segunda).toBe(`R-000045:${horas(26).getTime()}`);
  });

  it('AC5: una reservación cancelada no recibe el recordatorio', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { ReservacionRepository } =
      await import('@Reservaciones/repositories');
    await new ReservacionRepository({
      reservacion: { findMany },
    } as never).buscarRecordatoriosPendientes(AHORA, horas(2));
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      estado: 'CONFIRMADA',
      recordatorioEnviadoEn: null,
    });
  });

  it('AC6: los avisos van solo al cliente de la reservación y nunca más de un recordatorio', async () => {
    repo.buscarRecordatoriosPendientes.mockResolvedValue([
      { id: 45, inicio: horas(2), creadaEn: horas(-48), modificadaEn: null },
    ]);
    await recordatorios.enviarPendientes(AHORA);

    expect(notificaciones.notificar.mock.calls[0][0].destinatario).toEqual({
      usuarioId: 'c-1',
    });
    expect(repo.marcarRecordatorioEnviado).toHaveBeenCalledWith(45, AHORA);

    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const { ReservacionRepository } =
      await import('@Reservaciones/repositories');
    const real = new ReservacionRepository({
      reservacion: { updateMany },
    } as never);
    await expect(real.marcarRecordatorioEnviado(45, AHORA)).resolves.toBe(
      false,
    );
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 45,
      estado: 'CONFIRMADA',
      recordatorioEnviadoEn: null,
    });
  });
});
