import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarMovimientoDto } from './registrar-movimiento.dto.js';

const valido = { tipo: 'SALIDA', cantidad: 3, motivo: 'Uso en cocina' };

async function errores(datos: Record<string, unknown>): Promise<string[]> {
  const resultado = await validate(plainToInstance(RegistrarMovimientoDto, datos));
  return resultado.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('RegistrarMovimientoDto', () => {
  it('acepta una entrada y una salida válidas', async () => {
    expect(await errores(valido)).toEqual([]);
    expect(await errores({ ...valido, tipo: 'ENTRADA', cantidad: 0.5 })).toEqual([]);
  });

  it.each([0, -2])('rechaza la cantidad %d', async (cantidad) => {
    expect(await errores({ ...valido, cantidad })).toContain('La cantidad debe ser mayor a 0.');
  });

  it('rechaza un tipo inválido', async () => {
    expect(await errores({ ...valido, tipo: 'AJUSTE' })).toContain(
      'El tipo debe ser ENTRADA o SALIDA.',
    );
  });

  it('rechaza un motivo vacío', async () => {
    expect(await errores({ ...valido, motivo: '  ' })).toContain('El motivo es obligatorio.');
  });

  it('rechaza una cantidad como texto o fuera de rango', async () => {
    expect(await errores({ ...valido, cantidad: '3' })).not.toEqual([]);
    expect(await errores({ ...valido, cantidad: 1e12 })).toContain('La cantidad es demasiado grande.');
  });
});
