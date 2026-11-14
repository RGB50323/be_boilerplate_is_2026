export type MetaPaginacion = {
  pagina: number;
  totalPaginas: number;
  total: number;
};

export type Paginado<T> = MetaPaginacion & { datos: T[] };

// Registros a saltar para la página pedida
export const saltoDePagina = (pagina: number, porPagina: number) =>
  (pagina - 1) * porPagina;

export const metaPaginacion = (
  total: number,
  pagina: number,
  porPagina: number,
): MetaPaginacion => ({
  pagina,
  totalPaginas: Math.ceil(total / porPagina),
  total,
});

export const paginar = <T>(
  datos: T[],
  total: number,
  pagina: number,
  porPagina: number,
): Paginado<T> => ({ ...metaPaginacion(total, pagina, porPagina), datos });
