import type { Prisma } from '@PrismaClient';

export type SnapshotPdf = {
  version: 1;
  pedidoId: number;
  items: {
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }[];
  total: string;
};

function esObjeto(
  valor: Prisma.JsonValue | undefined,
): valor is Prisma.JsonObject {
  return (
    valor !== undefined &&
    valor !== null &&
    typeof valor === 'object' &&
    !Array.isArray(valor)
  );
}

function esImporte(valor: Prisma.JsonValue | undefined): valor is string {
  return typeof valor === 'string' && /^\d+\.\d{2}$/.test(valor);
}

export function esSnapshotPdf(valor: Prisma.JsonValue): valor is SnapshotPdf {
  return (
    esObjeto(valor) &&
    valor.version === 1 &&
    typeof valor.pedidoId === 'number' &&
    Number.isInteger(valor.pedidoId) &&
    esImporte(valor.total) &&
    Array.isArray(valor.items) &&
    valor.items.length > 0 &&
    valor.items.every(
      (item) =>
        esObjeto(item) &&
        typeof item.nombre === 'string' &&
        typeof item.cantidad === 'number' &&
        Number.isInteger(item.cantidad) &&
        item.cantidad > 0 &&
        esImporte(item.precioUnitario) &&
        esImporte(item.subtotal),
    )
  );
}
