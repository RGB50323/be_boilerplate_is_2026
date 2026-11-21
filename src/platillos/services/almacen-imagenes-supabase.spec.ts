import { AlmacenImagenesSupabase } from './almacen-imagenes-supabase.js';

describe('AlmacenImagenesSupabase', () => {
  const fetchMock = vi.fn();
  const almacen = new AlmacenImagenesSupabase({
    url: 'https://proyecto.supabase.co/',
    clave: 'clave-secreta',
    bucket: 'platillos',
  });

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sube el archivo al bucket con la clave y devuelve su URL pública', async () => {
    const contenido = Buffer.from([0x89, 0x50]);

    const url = await almacen.guardar('abc.png', contenido, 'image/png');

    expect(url).toBe(
      'https://proyecto.supabase.co/storage/v1/object/public/platillos/abc.png',
    );
    const [destino, init] = fetchMock.mock.calls[0];
    expect(destino).toBe('https://proyecto.supabase.co/storage/v1/object/platillos/abc.png');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      apikey: 'clave-secreta',
      Authorization: 'Bearer clave-secreta',
      'Content-Type': 'image/png',
      'x-upsert': 'false',
    });
    expect(Buffer.from(init.body)).toEqual(contenido);
  });

  it('falla con el estado y el mensaje si Storage rechaza la subida', async () => {
    fetchMock.mockResolvedValue(new Response('Bucket not found', { status: 404 }));

    await expect(almacen.guardar('abc.png', Buffer.from([1]), 'image/png')).rejects.toThrow(
      'Supabase Storage respondió 404: Bucket not found',
    );
  });
});
