import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListarNotificacionesQueryDto } from './listar-notificaciones-query.dto.js';

async function errores(pagina: unknown) {
  const dto = plainToInstance(ListarNotificacionesQueryDto, { pagina });
  return validate(dto);
}

describe('ListarNotificacionesQueryDto', () => {
  it.each(['1', '1000'])('acepta pagina %s', async (pagina) => {
    expect(await errores(pagina)).toHaveLength(0);
  });

  it.each(['0', '1001', '99999999999999999999', 'abc'])(
    'rechaza pagina %s',
    async (pagina) => {
      expect(await errores(pagina)).not.toHaveLength(0);
    },
  );
});
