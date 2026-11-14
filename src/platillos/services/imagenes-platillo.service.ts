import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const TAMANO_MAXIMO_IMAGEN = 2 * 1024 * 1024;
export const CARPETA_IMAGENES = join(process.cwd(), 'uploads', 'platillos');

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function detectarFormato(contenido: Buffer): 'png' | 'jpg' | null {
  if (
    contenido.length >= FIRMA_PNG.length &&
    FIRMA_PNG.every((byte, i) => contenido[i] === byte)
  ) {
    return 'png';
  }
  if (
    contenido.length >= 3 &&
    contenido[0] === 0xff &&
    contenido[1] === 0xd8 &&
    contenido[2] === 0xff
  ) {
    return 'jpg';
  }
  return null;
}

@Injectable()
export class ImagenesPlatilloService {
  async guardar(
    archivo: ArchivoSubido | undefined,
  ): Promise<{ imagenUrl: string }> {
    if (!archivo) {
      throw new BadRequestException(
        'Debes adjuntar una imagen en el campo "imagen".',
      );
    }
    if (archivo.size > TAMANO_MAXIMO_IMAGEN) {
      throw new PayloadTooLargeException(
        'La imagen no puede superar los 2 MB.',
      );
    }
    const formato = detectarFormato(archivo.buffer);
    if (formato === null) {
      throw new UnsupportedMediaTypeException(
        'Solo se permiten imágenes JPG o PNG.',
      );
    }

    await mkdir(CARPETA_IMAGENES, { recursive: true });
    const nombre = `${randomUUID()}.${formato}`;
    await writeFile(join(CARPETA_IMAGENES, nombre), archivo.buffer);

    return { imagenUrl: `/uploads/platillos/${nombre}` };
  }
}

export interface ArchivoSubido {
  buffer: Buffer;
  size: number;
}
