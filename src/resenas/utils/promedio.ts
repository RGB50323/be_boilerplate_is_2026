// Redondea a un decimal (4.25 -> 4.3)
export const redondearPromedio = (valor: number | null | undefined) =>
  valor == null ? null : Math.round((valor + Number.EPSILON) * 10) / 10;
