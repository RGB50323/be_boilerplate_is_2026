import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlmacenImagenes } from './almacen-imagenes.js';

export const CARPETA_IMAGENES = join(process.cwd(), 'uploads', 'platillos');

// Desarrollo y pruebas: disco del servidor, servido por main.ts en /uploads
export class AlmacenImagenesLocal implements AlmacenImagenes {
  async guardar(nombre: string, contenido: Buffer): Promise<string> {
    await mkdir(CARPETA_IMAGENES, { recursive: true });
    await writeFile(join(CARPETA_IMAGENES, nombre), contenido);
    return `/uploads/platillos/${nombre}`;
  }
}
