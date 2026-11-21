import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearInsumoDto } from './crear-insumo.dto.js';

const valido = { nombre: 'Masa de maíz', unidad: 'lb', minimo: 20 };

async function errores(datos: Record<string, unknown>): Promise<string[]> {
  const resultado = await validate(plainToInstance(CrearInsumoDto, datos));
  return resultado.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CrearInsumoDto', () => {
  it('acepta un insumo válido', async () => {
    expect(await errores(valido)).toEqual([]);
  });

  it('recorta el nombre y normaliza la unidad a minúsculas', () => {
    const dto = plainToInstance(CrearInsumoDto, { ...valido, nombre: '  Masa  ', unidad: ' KG ' });
    expect(dto.nombre).toBe('Masa');
    expect(dto.unidad).toBe('kg');
  });

  it.each(['', '   ', undefined])('rechaza el nombre vacío (%j)', async (nombre) => {
    expect(await errores({ ...valido, nombre })).toContain('El nombre del insumo es obligatorio.');
  });

  it('rechaza la unidad vacía', async () => {
    expect(await errores({ ...valido, unidad: '' })).toContain('La unidad es obligatoria.');
  });

  it('rechaza una unidad no permitida', async () => {
    expect(await errores({ ...valido, unidad: 'gr' })).toContain(
      'La unidad debe ser una de: lb, kg, l, unidad.',
    );
  });

  it.each(['lb', 'kg', 'l', 'unidad'])('acepta la unidad %s', async (unidad) => {
    expect(await errores({ ...valido, unidad })).toEqual([]);
  });

  it('rechaza un mínimo negativo y acepta mínimo 0', async () => {
    expect(await errores({ ...valido, minimo: -1 })).toContain('El mínimo no puede ser negativo.');
    expect(await errores({ ...valido, minimo: 0 })).toEqual([]);
  });

  it('rechaza un mínimo ausente, con más de tres decimales o fuera de rango', async () => {
    const { minimo: _minimo, ...sinMinimo } = valido;
    expect(await errores(sinMinimo)).not.toEqual([]);
    expect(await errores({ ...valido, minimo: 1.2345 })).not.toEqual([]);
    expect(await errores({ ...valido, minimo: 1e12 })).toContain('El mínimo es demasiado grande.');
  });
});
