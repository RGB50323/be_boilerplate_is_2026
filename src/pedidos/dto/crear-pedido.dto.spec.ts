import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CrearPedidoDto } from './crear-pedido.dto.js';

const valido = {
  tipo: 'MESA',
  mesaId: 7,
  items: [{ platilloId: 10, cantidad: 3, nota: 'sin curtido' }],
};

function mensajes(errores: ValidationError[]): string[] {
  return errores.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...mensajes(e.children ?? []),
  ]);
}

async function errores(datos: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CrearPedidoDto, datos);
  return mensajes(await validate(dto));
}

describe('CrearPedidoDto', () => {
  it('acepta un pedido válido', async () => {
    expect(await errores(valido)).toEqual([]);
  });

  it('acepta una nota nula o ausente', async () => {
    expect(
      await errores({ ...valido, items: [{ platilloId: 10, cantidad: 1, nota: null }] }),
    ).toEqual([]);
    expect(
      await errores({ ...valido, items: [{ platilloId: 10, cantidad: 1 }] }),
    ).toEqual([]);
  });

  it('recorta los espacios de la nota', () => {
    const dto = plainToInstance(CrearPedidoDto, {
      ...valido,
      items: [{ platilloId: 10, cantidad: 1, nota: '  sin cebolla  ' }],
    });
    expect(dto.items[0]?.nota).toBe('sin cebolla');
  });

  it('rechaza un tipo distinto de MESA', async () => {
    expect(await errores({ ...valido, tipo: 'LLEVAR' })).toContain(
      'Solo se admiten pedidos de mesa.',
    );
  });

  it('rechaza una mesa ausente o menor a 1', async () => {
    const { mesaId: _mesaId, ...sinMesa } = valido;
    expect(await errores(sinMesa)).toContain('La mesa es obligatoria.');
    expect(await errores({ ...valido, mesaId: 0 })).toContain(
      'La mesa es obligatoria.',
    );
  });

  it('rechaza un pedido sin platillos', async () => {
    const { items: _items, ...sinItems } = valido;
    expect(await errores({ ...valido, items: [] })).toContain(
      'El pedido debe tener al menos un platillo.',
    );
    expect((await errores(sinItems)).length).toBeGreaterThan(0);
  });

  it('rechaza una cantidad menor a 1 o decimal', async () => {
    const con = (cantidad: number) => ({
      ...valido,
      items: [{ platilloId: 10, cantidad }],
    });
    expect(await errores(con(0))).toContain('La cantidad debe ser al menos 1.');
    expect(await errores(con(-2))).toContain('La cantidad debe ser al menos 1.');
    expect(await errores(con(1.5))).toContain(
      'La cantidad debe ser un número entero.',
    );
  });

  it('rechaza un platillo ausente', async () => {
    expect(
      await errores({ ...valido, items: [{ cantidad: 1 }] }),
    ).toContain('El platillo es obligatorio.');
  });

  it('rechaza una nota de más de 200 caracteres', async () => {
    expect(
      await errores({
        ...valido,
        items: [{ platilloId: 10, cantidad: 1, nota: 'a'.repeat(201) }],
      }),
    ).toContain('La nota no puede superar los 200 caracteres.');
  });
});