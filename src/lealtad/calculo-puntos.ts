import type { Prisma } from '@PrismaClient';

export function calcularPuntos(monto: Prisma.Decimal, puntosPorDolar: number) {
  const puntosExactos = monto.mul(puntosPorDolar);
  return {
    puntosExactos,
    puntos: puntosExactos.floor().toNumber(),
  };
}
