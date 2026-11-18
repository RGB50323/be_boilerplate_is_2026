import { ModuloOrigen } from '@PrismaClient';
import type { NotificacionesService } from '@Notificaciones/services';
import type { ReservacionRepository } from '../repositories/reservacion.repository.js';
import { AvisosReservacionService } from './avisos-reservacion.service.js';

const CLIENTE_ID = '9f3dd0b4-843f-44e5-a94f-a574f89a4d33';

const reservacion = (cambios = {}) => ({
  id: 12,
  clienteId: CLIENTE_ID,
  personas: 4,
  // 20:00 UTC = 14:00 en El Salvador
  inicio: new Date('2026-11-20T20:00:00Z'),
  modificadaEn: null as Date | null,
  mesa: { numero: 5, sucursal: { nombre: 'Centro' } },
  ...cambios,
});

function crearContexto(datos: unknown = reservacion()) {
  const repository = { buscarParaAviso: vi.fn().mockResolvedValue(datos) };
  const notificaciones = {
    notificar: vi
      .fn()
      .mockResolvedValue({ registradas: 1, omitidasPorDuplicado: 0 }),
  };
  const service = new AvisosReservacionService(
    repository as unknown as ReservacionRepository,
    notificaciones as unknown as NotificacionesService,
  );
  return { service, repository, notificaciones };
}

describe('AvisosReservacionService', () => {
  it('confirma con fecha, hora local, personas y sucursal por plataforma y correo', async () => {
    const { service, repository, notificaciones } = crearContexto();

    await service.creada(12);

    expect(repository.buscarParaAviso).toHaveBeenCalledWith(12);
    expect(notificaciones.notificar).toHaveBeenCalledWith({
      destinatario: { usuarioId: CLIENTE_ID },
      titulo: 'Reservación confirmada',
      mensaje:
        'Tu reservación R-000012 quedó confirmada: 2026-11-20 a las 14:00, 4 personas, sucursal Centro, mesa 5.',
      moduloOrigen: ModuloOrigen.RESERVACIONES,
      referencia: { tipo: 'RESERVA_CONFIRMADA', id: 'R-000012' },
      enviarCorreo: true,
    });
  });

  it('cada modificación usa una referencia distinta para no tomarse como duplicada', async () => {
    const modificadaEn = new Date('2026-11-18T10:00:00Z');
    const { service, notificaciones } = crearContexto(
      reservacion({ modificadaEn }),
    );

    await service.modificada(12);

    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Reservación modificada',
        referencia: {
          tipo: 'RESERVA_MODIFICADA',
          id: `R-000012:${modificadaEn.getTime()}`,
        },
      }),
    );
  });

  it('avisa la cancelación', async () => {
    const { service, notificaciones } = crearContexto();

    await service.cancelada(12);

    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Reservación cancelada',
        referencia: { tipo: 'RESERVA_CANCELADA', id: 'R-000012' },
        enviarCorreo: true,
      }),
    );
  });

  it('el recordatorio usa una sola referencia por reservación', async () => {
    const { service, notificaciones } = crearContexto();

    await service.recordatorio(12);

    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Recordatorio de tu reservación',
        referencia: { tipo: 'RESERVA_RECORDATORIO', id: 'R-000012' },
      }),
    );
  });

  it('no avisa si la reservación no existe', async () => {
    const { service, notificaciones } = crearContexto(null);

    await service.creada(99);

    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('devuelve true cuando el aviso queda registrado', async () => {
    const { service } = crearContexto();

    await expect(service.recordatorio(12)).resolves.toBe(true);
  });

  it('un fallo del aviso no se propaga y devuelve false', async () => {
    const { service, notificaciones } = crearContexto();
    notificaciones.notificar.mockRejectedValue(new Error('caído'));

    await expect(service.creada(12)).resolves.toBe(false);
    await expect(service.recordatorio(12)).resolves.toBe(false);
  });
});
