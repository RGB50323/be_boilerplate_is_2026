import { Prisma } from '@PrismaClient';
import { calcularPuntos } from './calculo-puntos.js';

describe('calcularPuntos', () => {
  it.each([
    ['10.00', 1, '10', 10],
    ['10.75', 1, '10.75', 10],
    ['12.75', 3, '38.25', 38],
    ['19.99', 5, '99.95', 99],
    ['0.75', 1, '0.75', 0],
  ])(
    'calcula %s por %i y conserva %s con %i puntos enteros',
    (monto, tasa, exacto, entero) => {
      const resultado = calcularPuntos(new Prisma.Decimal(monto), tasa);
      expect(resultado.puntos).toBe(entero);
      expect(resultado.puntosExactos.toString()).toBe(exacto);
    },
  );
});
