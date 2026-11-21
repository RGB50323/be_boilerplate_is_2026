
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  EstadoTransaccionSimulada as Estado,
  PasarelaSimuladaService,
} from './pasarela-simulada.service.js';

describe('PasarelaSimuladaService - BE-16.2', () => {
  const pasarela = new PasarelaSimuladaService();

  it('crea una transacción inicial en PENDIENTE', () => {
    const resultado = pasarela.procesarPago('54');

    expect(resultado.estado).toBe(Estado.PENDIENTE);
    expect(resultado.referencia).toBe('54');
    expect(resultado.transaccionId).toBeTruthy();
  });

  it.each([
    [Estado.PENDIENTE, Estado.CONFIRMADO],
    [Estado.PENDIENTE, Estado.RECHAZADO],
    [Estado.CONFIRMADO, Estado.REEMBOLSADO],
  ])(
    'permite cambiar de %s a %s',
    (actual, nuevo) => {
      expect(pasarela.cambiarEstado(actual, nuevo)).toBe(nuevo);
    },
  );

  it.each([
    [Estado.PENDIENTE, Estado.REEMBOLSADO],
    [Estado.CONFIRMADO, Estado.RECHAZADO],
    [Estado.CONFIRMADO, Estado.PENDIENTE],
    [Estado.RECHAZADO, Estado.CONFIRMADO],
    [Estado.REEMBOLSADO, Estado.CONFIRMADO],
    [Estado.REEMBOLSADO, Estado.REEMBOLSADO],
  ])(
    'rechaza cambiar de %s a %s',
    (actual, nuevo) => {
      expect(() =>
        pasarela.cambiarEstado(actual, nuevo),
      ).toThrow(ConflictException);
    },
  );
});
