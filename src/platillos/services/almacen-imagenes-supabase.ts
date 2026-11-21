import type { AlmacenImagenes } from './almacen-imagenes.js';

export interface ConfigSupabaseStorage {
  url: string;
  clave: string;
  bucket: string;
}

// Producción: bucket público de Supabase Storage. El disco de Heroku se borra en cada reinicio.
export class AlmacenImagenesSupabase implements AlmacenImagenes {
  private readonly base: string;

  constructor(private readonly config: ConfigSupabaseStorage) {
    this.base = config.url.replace(/\/+$/, '');
  }

  async guardar(nombre: string, contenido: Buffer, tipo: string): Promise<string> {
    const ruta = `${encodeURIComponent(this.config.bucket)}/${encodeURIComponent(nombre)}`;
    const respuesta = await fetch(`${this.base}/storage/v1/object/${ruta}`, {
      method: 'POST',
      headers: {
        apikey: this.config.clave,
        Authorization: `Bearer ${this.config.clave}`,
        'Content-Type': tipo,
        'cache-control': 'max-age=31536000',
        'x-upsert': 'false',
      },
      body: new Uint8Array(contenido),
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) {
      throw new Error(
        `Supabase Storage respondió ${respuesta.status}: ${await respuesta.text()}`,
      );
    }
    return `${this.base}/storage/v1/object/public/${ruta}`;
  }
}
