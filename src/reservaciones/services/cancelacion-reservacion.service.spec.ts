import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EdicionReservacionRepository } from '@Reservaciones/repositories';
import type { AvisosReservacionService } from './avisos-reservacion.service.js';
import { CancelacionReservacionService } from './cancelacion-reservacion.service.js';

const futura = {
  id: 45,
  clienteId: 'cliente',
  estado: 'CONFIRMADA',
  mesaId: 3,
  personas: 4,
  inicio: new Date('2099-11-09T20:00:00Z'),
  creadaEn: new Date('2026-01-01'),
  modificadaEn: null,
  mesa: { numero: 2, sucursalId: 1, sucursal: { nombre: 'Centro' } },
};
function contexto(reserva: unknown = futura) {
  const tx = {};
  const repository = {
    editar: vi.fn(async (_id, _cliente, operacion) => operacion(reserva, tx)),
    cancelar: vi.fn().mockResolvedValue({ ...futura, estado: 'CANCELADA' }),
  };
  const avisos = {
    registrarCancelada: vi.fn().mockResolvedValue(['correo']),
    enviarCorreos: vi.fn(),
  };
  return {
    repository,
    avisos,
    tx,
    service: new CancelacionReservacionService(
      repository as unknown as EdicionReservacionRepository,
      avisos as unknown as AvisosReservacionService,
    ),
  };
}
it('cancela usando el cliente autenticado y registra el aviso en la misma transacción', async () => {
  const { service, repository, avisos, tx } = contexto();
  expect(await service.cancelar('R-000045', 'cliente')).toMatchObject({
    estado: 'CANCELADA',
    reservacionId: 'R-000045',
  });
  expect(repository.editar).toHaveBeenCalledWith(
    45,
    'cliente',
    expect.any(Function),
  );
  expect(repository.cancelar).toHaveBeenCalledWith(45, expect.any(Date), tx);
  expect(avisos.registrarCancelada).toHaveBeenCalledWith(
    expect.objectContaining({ estado: 'CANCELADA' }),
    tx,
  );
  expect(avisos.enviarCorreos).toHaveBeenCalledWith(['correo']);
});
it.each([
  [null, NotFoundException],
  [{ ...futura, estado: 'CANCELADA' }, BadRequestException],
  [{ ...futura, inicio: new Date('2000-01-01') }, BadRequestException],
])('rechaza una reserva ajena, cancelada o pasada', async (reserva, error) => {
  const { service, repository, avisos } = contexto(reserva);
  await expect(service.cancelar('R-000045', 'cliente')).rejects.toBeInstanceOf(
    error,
  );
  expect(repository.cancelar).not.toHaveBeenCalled();
  expect(avisos.registrarCancelada).not.toHaveBeenCalled();
});
it('propaga un fallo del aviso para revertir la transacción y no envía correo', async () => {
  const { service, avisos } = contexto();
  avisos.registrarCancelada.mockRejectedValue(new Error('aviso'));
  await expect(service.cancelar('R-000045', 'cliente')).rejects.toThrow(
    'aviso',
  );
  expect(avisos.enviarCorreos).not.toHaveBeenCalled();
});
