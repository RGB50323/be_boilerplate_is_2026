import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublicarResenaDto } from './publicar-resena.dto.js';

const valido = { pedidoId: 121, platilloId: 10, estrellas: 5 };

async function errores(datos: Record<string, unknown>) {
  const dto = plainToInstance(PublicarResenaDto, datos);
  const lista = await validate(dto);
  return {
    dto,
    mensajes: lista.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

describe('PublicarResenaDto', () => {
  it('acepta una reseña sin comentario', async () => {
    expect((await errores(valido)).mensajes).toEqual([]);
  });

  it('acepta de 1 a 5 estrellas', async () => {
    for (const estrellas of [1, 5]) {
      expect((await errores({ ...valido, estrellas })).mensajes).toEqual([]);
    }
  });

  it('rechaza estrellas fuera de 1 a 5 o con decimales', async () => {
    for (const estrellas of [0, 6, 4.5, undefined]) {
      expect((await errores({ ...valido, estrellas })).mensajes).toContain(
        'La calificación debe ser de 1 a 5 estrellas.',
      );
    }
  });

  it('acepta 500 caracteres y rechaza 501', async () => {
    const ok = await errores({ ...valido, comentario: 'a'.repeat(500) });
    expect(ok.mensajes).toEqual([]);
    const largo = await errores({ ...valido, comentario: 'a'.repeat(501) });
    expect(largo.mensajes).toContain(
      'El comentario no puede superar los 500 caracteres.',
    );
  });

  it('recorta el comentario y lo deja en null si queda vacío', async () => {
    expect(
      (await errores({ ...valido, comentario: '  Rico  ' })).dto.comentario,
    ).toBe('Rico');
    const vacio = await errores({ ...valido, comentario: '   ' });
    expect(vacio.mensajes).toEqual([]);
    expect(vacio.dto.comentario).toBeNull();
  });

  it('pide pedido y platillo', async () => {
    const { mensajes } = await errores({ estrellas: 4 });
    expect(mensajes).toEqual(
      expect.arrayContaining([
        'El pedido es obligatorio.',
        'El platillo es obligatorio.',
      ]),
    );
  });

  it('rechaza ids fuera del rango de INTEGER (evita un 500)', async () => {
    const { mensajes } = await errores({
      ...valido,
      pedidoId: 2147483648,
      platilloId: 2147483648,
    });
    expect(mensajes).toEqual(
      expect.arrayContaining([
        'El pedido no es válido.',
        'El platillo no es válido.',
      ]),
    );
    const limite = await errores({
      ...valido,
      pedidoId: 2147483647,
      platilloId: 2147483647,
    });
    expect(limite.mensajes).toEqual([]);
  });
});
