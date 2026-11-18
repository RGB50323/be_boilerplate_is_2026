import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  EstadoItem,
  EstadoPedido,
  PrismaClient,
  TipoPedido,
} from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import {
  PedidosRepository,
  type ItemExistente,
} from '../src/pedidos/repositories/pedidos.repository.js';

describe('LB-212: edición concurrente de cantidades', () => {
  let prisma: PrismaClient;
  let repository: PedidosRepository;

  let sucursalId: number;
  let categoriaId: number;
  let platilloId: number;
  let pedidoId: number;
  let item: ItemExistente;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta DATABASE_URL para la prueba.');
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      }),
    });

    await prisma.$connect();

    repository = new PedidosRepository(prisma as unknown as PrismaService);

    const nombre = `LB212-${randomUUID()}`;

    const sucursal = await prisma.sucursal.create({
      data: { nombre },
    });
    sucursalId = sucursal.id;

    const categoria = await prisma.categoria.create({
      data: { nombre },
    });
    categoriaId = categoria.id;

    const platillo = await prisma.platillo.create({
      data: {
        nombre,
        categoriaId,
        sucursales: {
          create: {
            sucursalId,
            precio: 2,
            disponibilidad: 10,
            activo: true,
          },
        },
      },
    });
    platilloId = platillo.id;

    const pedido = await prisma.pedido.create({
      data: {
        sucursalId,
        tipo: TipoPedido.MESA,
        estado: EstadoPedido.ENVIADO_COCINA,
        subtotal: 2,
        total: 2,
        detalles: {
          create: {
            platilloId,
            cantidad: 1,
            precioUnitario: 2,
            estado: EstadoItem.PENDIENTE,
          },
        },
      },
      include: { detalles: true },
    });
    pedidoId = pedido.id;
    item = pedido.detalles[0];
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;

    try {
      if (pedidoId) {
        await prisma.pedido.delete({ where: { id: pedidoId } });
      }
      if (platilloId) {
        await prisma.platillo.delete({ where: { id: platilloId } });
      }
      if (categoriaId) {
        await prisma.categoria.delete({ where: { id: categoriaId } });
      }
      if (sucursalId) {
        await prisma.sucursal.delete({ where: { id: sucursalId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it('dos cambios a cantidad 3 descuentan solo 2 unidades adicionales', async () => {
    await Promise.all([
      repository.cambiarItem(pedidoId, sucursalId, item, { cantidad: 3 }),
      repository.cambiarItem(pedidoId, sucursalId, item, { cantidad: 3 }),
    ]);

    const detalle = await prisma.detallePedido.findUniqueOrThrow({
      where: { id: item.id },
    });

    const existencia = await prisma.platilloSucursal.findUniqueOrThrow({
      where: {
        platilloId_sucursalId: { platilloId, sucursalId },
      },
    });

    const pedido = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
    });

    expect(detalle.cantidad).toBe(3);
    expect(existencia.disponibilidad).toBe(8);
    expect(pedido.total.toNumber()).toBe(6);
  }, 30_000);
});
