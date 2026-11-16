import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PaginacionQueryDto } from './paginacion-query.dto.js';

const validar = async (query: Record<string, unknown>) => {
  const dto = plainToInstance(PaginacionQueryDto, query);
  return { dto, errores: await validate(dto) };
};

describe('PaginacionQueryDto', () => {
  it('usa la página 1 por defecto', async () => {
    const { dto, errores } = await validar({});
    expect(errores).toHaveLength(0);
    expect(dto.pagina).toBe(1);
  });

  it('convierte el texto numérico a número', async () => {
    const { dto, errores } = await validar({ pagina: '3' });
    expect(errores).toHaveLength(0);
    expect(dto.pagina).toBe(3);
  });

  it.each(['0', '-1', '1.5', 'abc', '1001'])(
    'rechaza pagina=%s',
    async (pagina) => {
      const { errores } = await validar({ pagina });
      expect(errores).toHaveLength(1);
    },
  );
});
