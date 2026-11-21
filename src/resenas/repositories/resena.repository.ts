import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoPago, EstadoResena, MotivoOcultacion } from '@PrismaClient';

export type NuevaResena = {
  pedidoId: number;
  platilloId: number;
  clienteId: string;
  estrellas: number;
  comentario: string | null;
};

// Pago confirmado desde la fecha dada (sin confirmadoEn se usa creadoEn)
const pagoConfirmadoDesde = (desde: Date) => ({
  estado: EstadoPago.CONFIRMADO,
  OR: [
    { confirmadoEn: { gte: desde } },
    { confirmadoEn: null, creadoEn: { gte: desde } },
  ],
});

const SELECCION_MODERACION = {
  id: true,
  estrellas: true,
  comentario: true,
  estado: true,
  creadaEn: true,
  ocultaEn: true,
  motivoOcultacion: true,
  platillo: { select: { nombre: true } },
  cliente: { select: { nombre: true, apellido: true } },
  ocultaPor: { select: { nombre: true, apellido: true, email: true } },
} as const;

@Injectable()
export class ResenaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async platilloActivo(id: number): Promise<boolean> {
    const cantidad = await this.prisma.platillo.count({
      where: {
        id,
        sucursales: { some: { activo: true } },
      },
    });

    return cantidad > 0;
  }

  // Solo cuentan las visibles
  resumen(platilloId: number) {
    return this.prisma.resena.aggregate({
      where: { platilloId, estado: EstadoResena.VISIBLE },
      _avg: { estrellas: true },
      _count: { _all: true },
    });
  }

  distribucion(platilloId: number) {
    return this.prisma.resena.groupBy({
      by: ['estrellas'],
      where: { platilloId, estado: EstadoResena.VISIBLE },
      _count: { _all: true },
    });
  }

  // Dueño, si el platillo está en el pedido y su último pago confirmado
  buscarPedidoParaResena(pedidoId: number, platilloId: number) {
    return this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        clienteId: true,
        detalles: { where: { platilloId }, select: { id: true }, take: 1 },
        pagos: {
          where: { estado: EstadoPago.CONFIRMADO },
          orderBy: { id: 'desc' },
          take: 1,
          select: { confirmadoEn: true, creadoEn: true },
        },
      },
    });
  }

  crear(datos: NuevaResena) {
    return this.prisma.resena.create({
      data: datos,
      select: {
        id: true,
        pedidoId: true,
        platilloId: true,
        estrellas: true,
        comentario: true,
        creadaEn: true,
      },
    });
  }

  // Pedidos del cliente pagados dentro del plazo, con lo ya reseñado
  pedidosPorResenar(clienteId: string, desde: Date) {
    return this.prisma.pedido.findMany({
      where: { clienteId, pagos: { some: pagoConfirmadoDesde(desde) } },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        numero: true,
        sucursal: { select: { nombre: true } },
        detalles: {
          orderBy: { id: 'asc' },
          select: { platilloId: true, platillo: { select: { nombre: true } } },
        },
        resenas: { select: { platilloId: true } },
        pagos: {
          where: { estado: EstadoPago.CONFIRMADO },
          orderBy: { id: 'desc' },
          take: 1,
          select: { confirmadoEn: true, creadoEn: true },
        },
      },
    });
  }

  nombreSucursal(id: number) {
    return this.prisma.sucursal.findUnique({
      where: { id },
      select: { nombre: true },
    });
  }

  // H23: reseñas visibles de la sucursal agrupadas por estrellas
  distribucionSucursal(sucursalId: number, inicio?: Date, fin?: Date) {
    return this.prisma.resena.groupBy({
      by: ['estrellas'],
      where: {
        estado: EstadoResena.VISIBLE,
        pedido: { sucursalId },
        creadaEn: { gte: inicio, lt: fin },
      },
      _count: { _all: true },
    });
  }

  // H24: reseñas de la sucursal para moderar, de la más reciente a la más antigua
  listarModeracion(
    sucursalId: number,
    estado: EstadoResena | undefined,
    skip: number,
    take: number,
  ) {
    const where = { pedido: { sucursalId }, estado };
    return this.prisma.$transaction([
      this.prisma.resena.count({ where }),
      this.prisma.resena.findMany({
        where,
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: SELECCION_MODERACION,
      }),
    ]);
  }

  buscarModeracion(id: number) {
    return this.prisma.resena.findUnique({
      where: { id },
      select: {
        ...SELECCION_MODERACION,
        pedido: { select: { sucursalId: true } },
      },
    });
  }

  // Solo pasa a OCULTA si sigue VISIBLE: evita ocultarla dos veces
  async ocultar(id: number, usuarioId: string, motivo: MotivoOcultacion) {
    const { count } = await this.prisma.resena.updateMany({
      where: { id, estado: EstadoResena.VISIBLE },
      data: {
        estado: EstadoResena.OCULTA,
        ocultaPorId: usuarioId,
        ocultaEn: new Date(),
        motivoOcultacion: motivo,
      },
    });
    return count > 0;
  }

  findPagina(platilloId: number, skip: number, take: number) {
    return this.prisma.resena.findMany({
      where: { platilloId, estado: EstadoResena.VISIBLE },
      orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        estrellas: true,
        comentario: true,
        creadaEn: true,
        cliente: { select: { nombre: true, apellido: true } },
      },
    });
  }
}
