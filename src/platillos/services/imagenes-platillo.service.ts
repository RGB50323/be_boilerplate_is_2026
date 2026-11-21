import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ALMACEN_IMAGENES, type AlmacenImagenes } from './almacen-imagenes.js';

export const TAMANO_MAXIMO_IMAGEN = 2 * 1024 * 1024;

const TIPO_CONTENIDO = { png: 'image/png', jpg: 'image/jpeg' } as const;

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
  private readonly logger = new Logger(ImagenesPlatilloService.name);

  constructor(
    @Inject(ALMACEN_IMAGENES) private readonly almacen: AlmacenImagenes,
  ) {}

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

    const nombre = `${randomUUID()}.${formato}`;
    try {
      const imagenUrl = await this.almacen.guardar(
        nombre,
        archivo.buffer,
        TIPO_CONTENIDO[formato],
      );
      return { imagenUrl };
    } catch (error) {
      this.logger.error(
        `No se pudo guardar la imagen ${nombre}.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'No se pudo guardar la imagen. Intenta de nuevo.',
      );
    }
  }
}

export interface ArchivoSubido {
  buffer: Buffer;
  size: number;
}
