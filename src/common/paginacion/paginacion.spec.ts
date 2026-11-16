import { describe, expect, it } from 'vitest';
import { metaPaginacion, paginar, saltoDePagina } from './paginacion.js';

describe('paginación común', () => {
  it.each([
    [1, 10, 0],
    [2, 10, 10],
    [3, 20, 40],
  ])('saltoDePagina(%s, %s) = %s', (pagina, porPagina, esperado) => {
    expect(saltoDePagina(pagina, porPagina)).toBe(esperado);
  });

  it.each([
    [0, 0],
    [1, 1],
    [10, 1],
    [11, 2],
    [23, 3],
  ])('con %s registros hay %s páginas de 10', (total, paginas) => {
    expect(metaPaginacion(total, 1, 10).totalPaginas).toBe(paginas);
  });

  it('paginar arma la respuesta con los datos', () => {
    expect(paginar(['a', 'b'], 12, 2, 10)).toEqual({
      pagina: 2,
      totalPaginas: 2,
      total: 12,
      datos: ['a', 'b'],
    });
  });

  it('sin resultados devuelve 0 páginas y datos vacío', () => {
    expect(paginar([], 0, 1, 10)).toEqual({
      pagina: 1,
      totalPaginas: 0,
      total: 0,
      datos: [],
    });
  });
});
