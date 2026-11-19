import { Prisma, UnidadInsumo } from '@PrismaClient';
import { aUnidadInsumo, deUnidadInsumo, estadoDeInsumo } from '@Inventario/utils';

const d = (valor: number | string) => new Prisma.Decimal(valor);

describe('estadoDeInsumo', () => {
  it('es BAJO si la cantidad está por debajo del mínimo', () => {
    expect(estadoDeInsumo(d(9.999), d(10))).toBe('BAJO');
  });

  it('es BAJO si la cantidad es igual al mínimo', () => {
    expect(estadoDeInsumo(d('10.000'), d(10))).toBe('BAJO');
  });

  it('es NORMAL si la cantidad está por encima del mínimo', () => {
    expect(estadoDeInsumo(d(10.001), d(10))).toBe('NORMAL');
  });

  it('con mínimo 0 y sin existencia es BAJO', () => {
    expect(estadoDeInsumo(d(0), d(0))).toBe('BAJO');
  });
});

describe('unidades', () => {
  it('convierte entre la unidad de la API y la de la base', () => {
    expect(aUnidadInsumo('unidad')).toBe(UnidadInsumo.UNIDAD);
    expect(deUnidadInsumo(UnidadInsumo.LB)).toBe('lb');
  });
});
