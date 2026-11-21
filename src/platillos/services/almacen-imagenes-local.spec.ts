import { mkdir, writeFile } from 'node:fs/promises';
import { AlmacenImagenesLocal } from './almacen-imagenes-local.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe('AlmacenImagenesLocal', () => {
  beforeEach(() => {
    vi.mocked(mkdir).mockReset();
    vi.mocked(writeFile).mockReset();
  });

  it('crea la carpeta, escribe el archivo y devuelve la ruta servida en /uploads', async () => {
    const contenido = Buffer.from([1, 2, 3]);

    const url = await new AlmacenImagenesLocal().guardar('abc.png', contenido);

    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('platillos'), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/uploads[\\/]platillos[\\/]abc\.png$/),
      contenido,
    );
    expect(url).toBe('/uploads/platillos/abc.png');
  });
});
