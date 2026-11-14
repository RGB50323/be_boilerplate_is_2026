import { GuardarCategoriaDto } from '@Categorias/dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function validar(cuerpo: object) {
  const dto = plainToInstance(GuardarCategoriaDto, cuerpo);
  const errores = await validate(dto);
  return { dto, errores };
}

describe('GuardarCategoriaDto', () => {
  it('recorta los espacios al inicio y al final', async () => {
    const { dto, errores } = await validar({ nombre: '  Típicos  ' });

    expect(errores).toHaveLength(0);
    expect(dto.nombre).toBe('Típicos');
  });

  it('acepta un nombre de exactamente 50 caracteres', async () => {
    const { errores } = await validar({ nombre: 'x'.repeat(50) });
    expect(errores).toHaveLength(0);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('rechaza un nombre %s', async (_descripcion, nombre) => {
    const { errores } = await validar({ nombre });

    expect(errores).toHaveLength(1);
    expect(errores[0]?.constraints).toHaveProperty('isNotEmpty');
  });

  it('rechaza si falta el nombre', async () => {
    const { errores } = await validar({});
    expect(errores).toHaveLength(1);
  });

  it('rechaza un nombre de más de 50 caracteres', async () => {
    const { errores } = await validar({ nombre: 'x'.repeat(51) });

    expect(errores).toHaveLength(1);
    expect(errores[0]?.constraints).toHaveProperty('maxLength');
  });

  it('rechaza un nombre que no es texto', async () => {
    const { errores } = await validar({ nombre: 123 });

    expect(errores).toHaveLength(1);
    expect(errores[0]?.constraints).toHaveProperty('isString');
  });
});
