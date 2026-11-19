import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PagoRepository } from '../repositories/pago.repository.js';
import type { PagosService } from './pagos.service.js';
import { EstadoTransaccionSimulada } from './pasarela-simulada.service.js';
import { ResolucionTarjetasService } from './resolucion-tarjetas.service.js';

describe('ResolucionTarjetasService', () => {
  const buscarResolucionesSimuladas = vi.fn();
  const resolverTarjetaSimulada = vi.fn();
  const trabajador = () =>
    new ResolucionTarjetasService(
      { buscarResolucionesSimuladas } as unknown as PagoRepository,
      { resolverTarjetaSimulada } as unknown as PagosService,
    );

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('H16_SIMULADOR_RETRASO_MS', undefined);
    vi.stubEnv('H16_SIMULADOR_RESULTADO', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('lee pendientes vencidos con el retraso predeterminado y confirma al arrancar', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
    buscarResolucionesSimuladas.mockResolvedValue([
      { id: 1, transaccionId: 't-1' },
    ]);
    const servicio = trabajador();
    servicio.onApplicationBootstrap();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(buscarResolucionesSimuladas).toHaveBeenCalledWith(
        new Date('2026-11-19T11:59:58Z'),
        0,
      );
      expect(resolverTarjetaSimulada).toHaveBeenCalledWith(
        't-1',
        EstadoTransaccionSimulada.CONFIRMADO,
      );
    } finally {
      await servicio.onModuleDestroy();
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(buscarResolucionesSimuladas).toHaveBeenCalledOnce();
  });

  it.each(['RECHAZADO', 'PENDIENTE'])(
    'ignora el resultado %s fuera del entorno de pruebas',
    async (resultado) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('H16_SIMULADOR_RESULTADO', resultado);
      buscarResolucionesSimuladas.mockResolvedValue([
        { id: 1, transaccionId: 't-1' },
      ]);
      await trabajador().procesarLote();
      expect(resolverTarjetaSimulada).toHaveBeenCalledWith(
        't-1',
        EstadoTransaccionSimulada.CONFIRMADO,
      );
    },
  );

  it('no consulta pendientes cuando se configuran pendientes indefinidos en pruebas', async () => {
    vi.stubEnv('H16_SIMULADOR_RESULTADO', 'PENDIENTE');
    await trabajador().procesarLote();
    expect(buscarResolucionesSimuladas).not.toHaveBeenCalled();
  });

  it('avanza el cursor y vuelve al inicio para reintentar candidatos anteriores', async () => {
    buscarResolucionesSimuladas
      .mockResolvedValueOnce([{ id: 7, transaccionId: 't-7' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const servicio = trabajador();
    await servicio.procesarLote();
    await servicio.procesarLote();
    await servicio.procesarLote();
    expect(
      buscarResolucionesSimuladas.mock.calls.map(([, cursor]) => cursor),
    ).toEqual([0, 7, 0]);
  });
});
