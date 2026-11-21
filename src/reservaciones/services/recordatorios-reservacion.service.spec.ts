import type { ReservacionRepository } from '../repositories/reservacion.repository.js';
import type { AvisosReservacionService } from './avisos-reservacion.service.js';
import { RecordatoriosReservacionService } from './recordatorios-reservacion.service.js';

const AHORA = new Date('2026-11-20T18:00:00Z');
const HORA = 60 * 60_000;

const pendiente = (id: number, cambios = {}) => ({
  id,
  // Empieza en 1 h 30 min; creada con un día de anticipación
  inicio: new Date(AHORA.getTime() + 1.5 * HORA),
  creadaEn: new Date(AHORA.getTime() - 24 * HORA),
  modificadaEn: null as Date | null,
  ...cambios,
});

function crearContexto(pendientes: unknown[]) {
  const repository = {
    buscarRecordatoriosPendientes: vi.fn().mockResolvedValue(pendientes),
    marcarRecordatorioEnviado: vi.fn().mockResolvedValue(true),
  };
  const avisos = { recordatorio: vi.fn().mockResolvedValue(true) };
  const service = new RecordatoriosReservacionService(
    repository as unknown as ReservacionRepository,
    avisos as unknown as AvisosReservacionService,
  );
  return { service, repository, avisos };
}

describe('RecordatoriosReservacionService', () => {
  it('busca reservaciones que empiezan en las próximas 2 horas', async () => {
    const { service, repository } = crearContexto([]);

    await service.enviarPendientes(AHORA);

    expect(repository.buscarRecordatoriosPendientes).toHaveBeenCalledWith(
      AHORA,
      new Date(AHORA.getTime() + 2 * HORA),
    );
  });

  it('avisa y después marca el recordatorio de una reservación confirmada', async () => {
    const { service, repository, avisos } = crearContexto([pendiente(1)]);

    await expect(service.enviarPendientes(AHORA)).resolves.toBe(1);
    expect(avisos.recordatorio).toHaveBeenCalledWith(1);
    expect(repository.marcarRecordatorioEnviado).toHaveBeenCalledWith(1, AHORA);
    expect(avisos.recordatorio.mock.invocationCallOrder[0]).toBeLessThan(
      repository.marcarRecordatorioEnviado.mock.invocationCallOrder[0],
    );
  });

  it('no envía recordatorio si se reservó con menos de 2 horas de anticipación', async () => {
    const { service, repository, avisos } = crearContexto([
      pendiente(2, { creadaEn: new Date(AHORA.getTime() - 10 * 60_000) }),
    ]);

    await expect(service.enviarPendientes(AHORA)).resolves.toBe(0);
    expect(repository.marcarRecordatorioEnviado).not.toHaveBeenCalled();
    expect(avisos.recordatorio).not.toHaveBeenCalled();
  });

  it('usa la fecha de modificación para la anticipación', async () => {
    const { service, avisos } = crearContexto([
      // Creada tarde pero modificada con 2 h o más de anticipación
      pendiente(3, {
        creadaEn: new Date(AHORA.getTime() + HORA),
        modificadaEn: new Date(AHORA.getTime() - 3 * HORA),
      }),
      // Creada con tiempo pero movida a menos de 2 h
      pendiente(4, { modificadaEn: new Date(AHORA.getTime() - 10 * 60_000) }),
    ]);

    await expect(service.enviarPendientes(AHORA)).resolves.toBe(1);
    expect(avisos.recordatorio).toHaveBeenCalledWith(3);
    expect(avisos.recordatorio).not.toHaveBeenCalledWith(4);
  });

  it('si el aviso falla no marca y la siguiente pasada lo reintenta', async () => {
    const { service, repository, avisos } = crearContexto([pendiente(5)]);
    avisos.recordatorio.mockResolvedValueOnce(false);

    await expect(service.enviarPendientes(AHORA)).resolves.toBe(0);
    expect(repository.marcarRecordatorioEnviado).not.toHaveBeenCalled();

    // Sigue pendiente porque no se marcó
    await expect(service.enviarPendientes(AHORA)).resolves.toBe(1);
    expect(avisos.recordatorio).toHaveBeenCalledTimes(2);
    expect(repository.marcarRecordatorioEnviado).toHaveBeenCalledWith(5, AHORA);
  });

  it('un fallo de un aviso no detiene los demás', async () => {
    const { service, avisos } = crearContexto([pendiente(6), pendiente(7)]);
    avisos.recordatorio.mockResolvedValueOnce(false);

    await expect(service.enviarPendientes(AHORA)).resolves.toBe(1);
    expect(avisos.recordatorio).toHaveBeenCalledWith(7);
  });

  it('el proceso programado no lanza si falla la consulta', async () => {
    const { service, repository } = crearContexto([]);
    repository.buscarRecordatoriosPendientes.mockRejectedValue(new Error('db'));

    await expect(service.ejecutar()).resolves.toBeUndefined();
  });
});
