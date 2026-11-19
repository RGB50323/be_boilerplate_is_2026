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
