import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListarPlatillosQueryDto } from './listar-platillos-query.dto.js';

async function errores(datos: Record<string, unknown>) {
  const dto = plainToInstance(ListarPlatillosQueryDto, datos);
  const fallos = await validate(dto);
  return {
    dto,
    mensajes: fallos.flatMap((f) => Object.values(f.constraints ?? {})),
  };
}

describe('ListarPlatillosQueryDto', () => {
  it('usa la página 1 y no exige búsqueda por defecto', async () => {
    const { dto, mensajes } = await errores({});

    expect(mensajes).toEqual([]);
    expect(dto.pagina).toBe(1);
    expect(dto.q).toBeUndefined();
  });

  it('convierte la página de texto a número', async () => {
    const { dto, mensajes } = await errores({ pagina: '2' });

    expect(mensajes).toEqual([]);
    expect(dto.pagina).toBe(2);
  });

  it('recorta los espacios de la búsqueda', async () => {
    const { dto } = await errores({ q: '  pupusa  ' });

    expect(dto.q).toBe('pupusa');
  });

  it('rechaza una página menor a 1', async () => {
    const { mensajes } = await errores({ pagina: '0' });

    expect(mensajes).toContain('La página debe ser mayor o igual a 1.');
  });

  it('rechaza una búsqueda de más de 120 caracteres', async () => {
    const { mensajes } = await errores({ q: 'a'.repeat(121) });

    expect(mensajes).toContain(
      'La búsqueda no puede superar los 120 caracteres.',
    );
  });
});
