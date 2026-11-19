import { Prisma, UnidadInsumo } from '@PrismaClient';

export const UNIDADES_INSUMO = ['lb', 'kg', 'l', 'unidad'] as const;
export type UnidadInsumoApi = (typeof UNIDADES_INSUMO)[number];

export const ESTADOS_INSUMO = ['BAJO', 'NORMAL'] as const;
export type EstadoInsumo = (typeof ESTADOS_INSUMO)[number];

// Tope de DECIMAL(12, 3) y de INTEGER en PostgreSQL: más grande daría un 500
export const CANTIDAD_MAXIMA = 999_999_999.999;
export const ID_MAXIMO = 2_147_483_647;

export const aUnidadInsumo = (unidad: UnidadInsumoApi): UnidadInsumo =>
  unidad.toUpperCase() as UnidadInsumo;

export const deUnidadInsumo = (unidad: UnidadInsumo): UnidadInsumoApi =>
  unidad.toLowerCase() as UnidadInsumoApi;

export const estadoDeInsumo = (
  cantidad: Prisma.Decimal,
  minimo: Prisma.Decimal,
): EstadoInsumo => (cantidad.lte(minimo) ? 'BAJO' : 'NORMAL');
