import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CambiarItemDto } from './cambiar-item.dto.js';

async function validar(datos: object) {
  const dto = plainToInstance(CambiarItemDto, datos);
  const errores = await validate(dto);
  return {
    dto,
    mensajes: errores.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

describe('CambiarItemDto', () => {
  it('acepta solo cantidad', async () => {
    expect((await validar({ cantidad: 3 })).mensajes).toEqual([]);
  });

  it('acepta solo nota', async () => {
    expect((await validar({ nota: 'sin cebolla' })).mensajes).toEqual([]);
  });

  it('acepta cantidad y nota juntas', async () => {
    expect((await validar({ cantidad: 2, nota: 'x' })).mensajes).toEqual([]);
  });

  it('acepta nota null para borrarla', async () => {
    expect((await validar({ nota: null })).mensajes).toEqual([]);
  });

  it('acepta un body vacío (el service lo rechaza con 400)', async () => {
    expect((await validar({})).mensajes).toEqual([]);
  });

  it('rechaza cantidad 0', async () => {
    expect((await validar({ cantidad: 0 })).mensajes).toContain(
      'La cantidad debe ser al menos 1.',
    );
  });

  it('rechaza cantidad decimal', async () => {
    expect((await validar({ cantidad: 1.5 })).mensajes).toContain(
      'La cantidad debe ser un número entero.',
    );
  });

  it('rechaza una nota de más de 200 caracteres', async () => {
    expect((await validar({ nota: 'a'.repeat(201) })).mensajes).toContain(
      'La nota no puede superar los 200 caracteres.',
    );
  });

  it('recorta los espacios de la nota', async () => {
    const { dto } = await validar({ nota: '  sin sal  ' });
    expect(dto.nota).toBe('sin sal');
  });
});