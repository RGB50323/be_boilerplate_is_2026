export interface AlmacenImagenes {
  /** Guarda la imagen y devuelve la URL con la que se muestra. */
  guardar(nombre: string, contenido: Buffer, tipo: string): Promise<string>;
}

export const ALMACEN_IMAGENES = Symbol('ALMACEN_IMAGENES');
