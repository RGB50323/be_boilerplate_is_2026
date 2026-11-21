import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv: Supabase Storage', () => {
  it('sin Supabase las imágenes quedan en disco y el bucket por defecto es platillos', () => {
    expect(validateEnv(base)).toMatchObject({
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_BUCKET_PLATILLOS: 'platillos',
    });
  });

  it('acepta la URL y la clave juntas', () => {
    expect(
      validateEnv({
        ...base,
        SUPABASE_URL: 'https://proyecto.supabase.co',
        SUPABASE_SECRET_KEY: 'clave',
        SUPABASE_BUCKET_PLATILLOS: 'imagenes',
      }),
    ).toMatchObject({
      SUPABASE_URL: 'https://proyecto.supabase.co',
      SUPABASE_BUCKET_PLATILLOS: 'imagenes',
    });
  });

  it.each([
    [{ SUPABASE_URL: 'https://proyecto.supabase.co' }],
    [{ SUPABASE_SECRET_KEY: 'clave' }],
  ])('falla si falta una de las dos (%j)', (parcial) => {
    expect(() => validateEnv({ ...base, ...parcial })).toThrow(/van juntas/);
  });

  it('falla si la URL no es http(s)', () => {
    expect(() =>
      validateEnv({ ...base, SUPABASE_URL: 'proyecto.supabase.co', SUPABASE_SECRET_KEY: 'clave' }),
    ).toThrow(/http\(s\)/);
  });
});
