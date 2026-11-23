import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiValidationPipe } from '../pipes/api-validation.pipe.js';
import { paginar, saltoDePagina } from './paginacion.js';
import { PaginacionQueryDto } from './paginacion-query.dto.js';

// H32. Paginación reutilizable para backend y frontend (backend).
// AC4 y AC5 (flechas y lector de pantalla) se prueban en el frontend:
// test/h32-paginacion.test.tsx.

const pipe = new ApiValidationPipe();
const query = (pagina: unknown) =>
  pipe.transform({ pagina }, { type: 'query', metatype: PaginacionQueryDto });

describe('H32. Paginación reutilizable para backend y frontend', () => {
  it('AC1: ?pagina=N devuelve pagina, totalPaginas y total junto con los datos de esa página', async () => {
    const dto = (await query('3')) as PaginacionQueryDto;
    expect(dto.pagina).toBe(3);
    expect(saltoDePagina(3, 10)).toBe(20);
    expect(paginar(['a', 'b'], 22, 3, 10)).toEqual({
      pagina: 3,
      totalPaginas: 3,
      total: 22,
      datos: ['a', 'b'],
    });
  });

  it('AC2: una página menor a 1, decimal, texto o mayor a 1000 responde 400 con un mensaje claro', async () => {
    for (const pagina of ['0', '1.5', 'abc', '1001']) {
      await expect(query(pagina), pagina).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    const error = await query('0').catch((e: BadRequestException) => e);
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain('La página debe ser mayor o igual a 1.');
  });

  it('AC3: un listado sin resultados da totalPaginas 0 y datos vacíos', () => {
    expect(paginar([], 0, 1, 10)).toEqual({
      pagina: 1,
      totalPaginas: 0,
      total: 0,
      datos: [],
    });
  });
});
