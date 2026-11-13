import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GuardarPlatilloDto } from './guardar-platillo.dto.js';

const valido = {
  nombre: 'Pupusa revuelta',
  descripcion: 'Con queso',
  precio: 1.25,
  categoriaId: 2,
  disponibilidad: 40,
  imagenUrl: '/uploads/platillos/p.png',
};

async function errores(datos: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(GuardarPlatilloDto, datos);
  const resultado = await validate(dto);
  return resultado.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('GuardarPlatilloDto', () => {
  it('acepta un platillo válido', async () => {
    expect(await errores(valido)).toEqual([]);
  });

  it('recorta los espacios del nombre y de la descripción', () => {
    const dto = plainToInstance(GuardarPlatilloDto, {
      ...valido,
      nombre: '  Pupusa  ',
      descripcion: '  Con queso  ',
    });
    expect(dto.nombre).toBe('Pupusa');
    expect(dto.descripcion).toBe('Con queso');
  });

  it('rechaza un nombre vacío', async () => {
    expect(await errores({ ...valido, nombre: '' })).toContain(
      'El nombre del platillo es obligatorio.',
    );
  });

  it('rechaza un nombre de solo espacios', async () => {
    expect(await errores({ ...valido, nombre: '   ' })).toContain(
      'El nombre del platillo es obligatorio.',
    );
  });

  it('rechaza un nombre ausente', async () => {
    const { nombre: _nombre, ...sinNombre } = valido;
    expect(await errores(sinNombre)).toContain(
      'El nombre del platillo es obligatorio.',
    );
  });

  it('rechaza un nombre de más de 120 caracteres', async () => {
    expect(await errores({ ...valido, nombre: 'a'.repeat(121) })).toContain(
      'El nombre no puede superar los 120 caracteres.',
    );
  });

  it('rechaza una descripción vacía, de espacios o ausente', async () => {
    const { descripcion: _descripcion, ...sinDescripcion } = valido;
    expect(await errores({ ...valido, descripcion: '' })).toContain(
      'La descripción es obligatoria.',
    );
    expect(await errores({ ...valido, descripcion: '   ' })).toContain(
      'La descripción es obligatoria.',
    );
    expect(await errores(sinDescripcion)).toContain(
      'La descripción es obligatoria.',
    );
  });

  it('rechaza un precio de 0 o negativo', async () => {
    expect(await errores({ ...valido, precio: 0 })).toContain(
      'El precio debe ser mayor a 0.',
    );
    expect(await errores({ ...valido, precio: -3 })).toContain(
      'El precio debe ser mayor a 0.',
    );
  });

  it('rechaza un precio con más de dos decimales', async () => {
    expect(await errores({ ...valido, precio: 1.234 })).toContain(
      'El precio es obligatorio y debe ser un número con máximo dos decimales.',
    );
  });

  it('rechaza un precio ausente o enviado como texto', async () => {
    const { precio: _precio, ...sinPrecio } = valido;
    expect((await errores(sinPrecio)).length).toBeGreaterThan(0);
    expect(
      (await errores({ ...valido, precio: '1.25' })).length,
    ).toBeGreaterThan(0);
  });

  it('rechaza una disponibilidad negativa', async () => {
    expect(await errores({ ...valido, disponibilidad: -1 })).toContain(
      'La disponibilidad no puede ser negativa.',
    );
  });

  it('rechaza una disponibilidad ausente o decimal', async () => {
    const { disponibilidad: _disponibilidad, ...sinDisponibilidad } = valido;
    expect(await errores(sinDisponibilidad)).toContain(
      'La disponibilidad es obligatoria y debe ser un número entero.',
    );
    expect(await errores({ ...valido, disponibilidad: 1.5 })).toContain(
      'La disponibilidad es obligatoria y debe ser un número entero.',
    );
  });

  it('acepta disponibilidad 0', async () => {
    expect(await errores({ ...valido, disponibilidad: 0 })).toEqual([]);
  });

  it('rechaza una categoría ausente o menor a 1', async () => {
    const { categoriaId: _categoriaId, ...sinCategoria } = valido;
    expect(await errores(sinCategoria)).toContain(
      'La categoría es obligatoria.',
    );
    expect(await errores({ ...valido, categoriaId: 0 })).toContain(
      'La categoría es obligatoria.',
    );
  });

  it('rechaza una imagen vacía o ausente', async () => {
    const { imagenUrl: _imagenUrl, ...sinImagen } = valido;
    expect(await errores({ ...valido, imagenUrl: '' })).toContain(
      'La imagen es obligatoria.',
    );
    expect(await errores(sinImagen)).toContain('La imagen es obligatoria.');
  });

  it('rechaza una ruta de imagen de más de 255 caracteres', async () => {
    expect(await errores({ ...valido, imagenUrl: 'a'.repeat(256) })).toContain(
      'La ruta de la imagen es demasiado larga.',
    );
  });
});
