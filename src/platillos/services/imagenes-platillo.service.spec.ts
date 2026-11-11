import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ImagenesPlatilloService,
  TAMANO_MAXIMO_IMAGEN,
} from './imagenes-platillo.service.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function archivo(buffer: Buffer, size = buffer.length) {
  return { buffer, size };
}

describe('ImagenesPlatilloService', () => {
  let service: ImagenesPlatilloService;

  beforeEach(() => {
    vi.mocked(mkdir).mockReset();
    vi.mocked(writeFile).mockReset();
    service = new ImagenesPlatilloService();
  });

  it('responde 400 si no se adjunta ningún archivo', async () => {
    const promesa = service.guardar(undefined);

    await expect(promesa).rejects.toBeInstanceOf(BadRequestException);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('responde 413 si la imagen supera los 2 MB', async () => {
    const promesa = service.guardar(archivo(PNG, TAMANO_MAXIMO_IMAGEN + 1));

    await expect(promesa).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('acepta una imagen de exactamente 2 MB', async () => {
    const resultado = await service.guardar(archivo(PNG, TAMANO_MAXIMO_IMAGEN));

    expect(resultado.imagenUrl).toMatch(/\.png$/);
  });

  it('guarda un PNG y devuelve su ruta pública', async () => {
    const resultado = await service.guardar(archivo(PNG));

    expect(resultado.imagenUrl).toMatch(
      /^\/uploads\/platillos\/[0-9a-f-]{36}\.png$/,
    );
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('platillos'),
      PNG,
    );
  });

  it('guarda un JPG y devuelve su ruta pública', async () => {
    const resultado = await service.guardar(archivo(JPG));

    expect(resultado.imagenUrl).toMatch(
      /^\/uploads\/platillos\/[0-9a-f-]{36}\.jpg$/,
    );
  });

  it('crea la carpeta de imágenes si no existe', async () => {
    await service.guardar(archivo(PNG));

    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('platillos'), {
      recursive: true,
    });
  });

  it('responde 415 si el contenido no es JPG ni PNG', async () => {
    const promesa = service.guardar(archivo(Buffer.from('hola mundo')));

    await expect(promesa).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(promesa).rejects.toThrow(
      'Solo se permiten imágenes JPG o PNG.',
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('responde 415 si el archivo está vacío', async () => {
    await expect(
      service.guardar(archivo(Buffer.alloc(0))),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('genera un nombre distinto en cada subida', async () => {
    const primera = await service.guardar(archivo(PNG));
    const segunda = await service.guardar(archivo(PNG));

    expect(primera.imagenUrl).not.toBe(segunda.imagenUrl);
  });
});
