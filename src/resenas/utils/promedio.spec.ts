import { describe, expect, it } from 'vitest';
import { redondearPromedio } from './promedio.js';

describe('redondearPromedio', () => {
  it.each([
    [4.25, 4.3],
    [4.56, 4.6],
    [4.04, 4],
    [5, 5],
    [null, null],
    [undefined, null],
  ])('%s -> %s', (valor, esperado) => {
    expect(redondearPromedio(valor)).toBe(esperado);
  });
});
