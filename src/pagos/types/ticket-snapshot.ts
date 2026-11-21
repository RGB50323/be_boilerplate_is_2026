export type TicketSnapshot = {
  version: 1;
  pedidoId: number;
  items: {
    platilloId: number;
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }[];
  total: string;
};

export function correoLealtadDelSnapshot(
  snapshot: unknown,
): string | undefined {
  if (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    'correoLealtad' in snapshot &&
    typeof snapshot.correoLealtad === 'string'
  ) {
    return snapshot.correoLealtad;
  }
}
