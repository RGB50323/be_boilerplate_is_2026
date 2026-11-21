import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { AgregarItemsDto } from './agregar-items.dto.js';

function mensajes(errores: ValidationError[]): string[] {
  return errores.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...mensajes(e.children ?? []),
  ]);
}

async function validar(datos: object): Promise<string[]> {
  const dto = plainToInstance(AgregarItemsDto, datos);
  return mensajes(await validate(dto));
}

describe('AgregarItemsDto', () => {
  it('acepta una lista válida', async () => {
    expect(
      await validar({ items: [{ platilloId: 1, cantidad: 2, nota: 'sin sal' }] }),
    ).toEqual([]);
  });

  it('acepta items sin nota', async () => {
    expect(await validar({ items: [{ platilloId: 1, cantidad: 1 }] })).toEqual(
      [],
    );
  });

  it('rechaza una lista vacía', async () => {
    expect(await validar({ items: [] })).toContain(
      'Debes agregar al menos un platillo.',
    );
  });

  it('rechaza si items no es una lista', async () => {
    expect(await validar({ items: 'hola' })).toContain(
      'Los platillos deben enviarse como una lista.',
    );
  });

  it('rechaza cantidad menor a 1 en un item', async () => {
    expect(
      await validar({ items: [{ platilloId: 1, cantidad: 0 }] }),
    ).toContain('La cantidad debe ser al menos 1.');
  });

  it('rechaza una nota de más de 200 caracteres', async () => {
    const errores = await validar({
      items: [{ platilloId: 1, cantidad: 1, nota: 'a'.repeat(201) }],
    });
    expect(errores).toContain('La nota no puede superar los 200 caracteres.');
  });
});