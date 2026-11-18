import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EstadoPago,
  EstadoPedido,
  PrismaClient,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import type { PedidosLlevarService } from '../src/pedidos/services/pedidos-llevar.service.js';
import { ComprobantesRepository } from '../src/comprobantes/repositories/comprobantes.repository.js';
import { ComprobantesService } from '../src/comprobantes/services/comprobantes.service.js';
import { ComprobantePdfGenerator } from '../src/comprobantes/services/comprobante-pdf.generator.js';
import { PagoRepository } from '../src/pagos/repositories/pago.repository.js';
import { PagosService } from '../src/pagos/services/pagos.service.js';
import {
  EstadoTransaccionSimulada,
  PasarelaSimuladaService,
} from '../src/pagos/services/pasarela-simulada.service.js';

// Base aislada con las migraciones aplicadas. Las pruebas necesitan commits reales.
const databaseUrl = process.env.PAGOS_TEST_DATABASE_URL;

async function crearDatos(prisma: PrismaClient) {
  return prisma.$transaction(async (tx) => {
    const sucursal = await tx.sucursal.create({
      data: { nombre: randomUUID() },
    });
    const mesa = await tx.mesa.create({
      data: { sucursalId: sucursal.id, numero: 1 },
    });
    const platillo = await tx.platillo.create({
      data: {
        nombre: 'Limonada',
        categoria: { create: { nombre: 'Bebidas' } },
      },
    });
    const pedido = await tx.pedido.create({
      data: {
        tipo: TipoPedido.MESA,
        estado: EstadoPedido.PENDIENTE_PAGO,
        sucursalId: sucursal.id,
        mesaId: mesa.id,
        subtotal: '4.50',
        total: '4.50',
        detalles: {
          create: {
            platilloId: platillo.id,
            cantidad: 2,
            precioUnitario: '2.25',
          },
        },
      },
    });
    return { sucursal, mesa, platillo, pedido };
  });
}

describe.skipIf(!databaseUrl)('H17 - emisión automática en PostgreSQL', () => {
  let prisma: PrismaClient;
  let datos: Awaited<ReturnType<typeof crearDatos>> | undefined;
  let service: PagosService;
  const usuario = { rol: Rol.GERENTE_GENERAL } as User;

  beforeEach(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    datos = await crearDatos(prisma);
    service = new PagosService(
      new PagoRepository(
        prisma as PrismaService,
        new ComprobantesService(new ComprobantesRepository()),
      ),
      new PasarelaSimuladaService(),
      {} as PedidosLlevarService,
    );
  });

  afterEach(async () => {
    try {
      if (datos) {
        const { pedido, platillo, mesa, sucursal } = datos;
        await prisma.$transaction([
          prisma.comprobante.deleteMany({ where: { ticketId: pedido.id } }),
          prisma.pago.deleteMany({ where: { pedidoId: pedido.id } }),
          prisma.pedido.delete({ where: { id: pedido.id } }),
          prisma.platillo.delete({ where: { id: platillo.id } }),
          prisma.categoria.delete({ where: { id: platillo.categoriaId } }),
          prisma.mesa.delete({ where: { id: mesa.id } }),
          prisma.sucursal.delete({ where: { id: sucursal.id } }),
        ]);
      }
    } finally {
      datos = undefined;
      await prisma.$disconnect();
    }
  });

  function solicitud() {
    return {
      solicitudId: randomUUID(),
      ticket: {
        id: datos!.pedido.id,
        total: 4.5,
        items: [
          {
            nombre: 'Limonada',
            cantidad: 2,
            precio_unitario: 2.25,
            subtotal: 4.5,
          },
        ],
      },
    };
  }

  function confirmar(transaccionId: string) {
    return service.cambiarEstadoTransaccion(
      transaccionId,
      EstadoTransaccionSimulada.CONFIRMADO,
    );
  }

  it('reclama un solo ORIGINAL en PostgreSQL y conserva la fecha tras el reembolso', async () => {
    const pago = await service.procesarPago(solicitud(), usuario);
    const transaccionId = pago.transaccionId!;
    await confirmar(transaccionId);
    const original = await prisma.comprobante.findUniqueOrThrow({
      where: { transaccionId },
    });
    const where = { id: original.id };
    expect(original.primeraGeneracionPdfEn).toBeNull();

    const generator = new ComprobantePdfGenerator();
    const generar = generator.generar.bind(generator);
    const modos = new WeakMap<Buffer, 'ORIGINAL' | 'COPIA'>();
    const spy = vi
      .spyOn(generator, 'generar')
      .mockImplementation(async (datosPdf, tipo) => {
        const buffer = await generar(datosPdf, tipo);
        modos.set(buffer, tipo);
        return buffer;
      });
    const module = await Test.createTestingModule({
      providers: [
        ComprobantesService,
        ComprobantesRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: ComprobantePdfGenerator, useValue: generator },
      ],
    }).compile();

    try {
      const comprobantes = module.get(ComprobantesService);
      await comprobantes.consultar(original.id, usuario);
      await expect(
        comprobantes.descargarPdf(original.id, {
          rol: Rol.CLIENTE,
          id: randomUUID(),
        } as User),
      ).rejects.toMatchObject({ status: 403 });
      spy.mockRejectedValueOnce(new Error('Falló el Buffer'));
      await expect(
        comprobantes.descargarPdf(original.id, usuario),
      ).rejects.toThrow('Falló el Buffer');
      expect(
        await prisma.comprobante.findUniqueOrThrow({ where }),
      ).toStrictEqual(original);

      const descargas = await Promise.all([
        comprobantes.descargarPdf(original.id, usuario),
        comprobantes.descargarPdf(original.id, usuario),
      ]);
      expect(descargas.map(({ buffer }) => modos.get(buffer)).sort()).toEqual([
        'COPIA',
        'ORIGINAL',
      ]);
      const generado = await prisma.comprobante.findUniqueOrThrow({ where });
      expect(generado).toStrictEqual({
        ...original,
        primeraGeneracionPdfEn: expect.any(Date),
      });

      await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.REEMBOLSADO,
      );
      expect(
        modos.get(
          (await comprobantes.descargarPdf(original.id, usuario)).buffer,
        ),
      ).toBe('COPIA');
      expect(
        await prisma.comprobante.findUniqueOrThrow({ where }),
      ).toStrictEqual(generado);
    } finally {
      await module.close();
    }
  });

  it('emite el snapshot original tras un reintento y lo conserva al reembolsar', async () => {
    const entrada = solicitud();
    const pago = await service.procesarPago(entrada, usuario);
    const where = { transaccionId: pago.transaccionId! };
    const snapshot = {
      version: 1,
      pedidoId: entrada.ticket.id,
      items: [
        {
          platilloId: datos!.platillo.id,
          nombre: 'Limonada',
          cantidad: 2,
          precioUnitario: '2.25',
          subtotal: '4.50',
        },
      ],
      total: '4.50',
    };
    expect(
      (await prisma.pago.findUniqueOrThrow({ where })).ticketSnapshot,
    ).toStrictEqual(snapshot);
    expect(await prisma.comprobante.findUnique({ where })).toBeNull();

    await prisma.platillo.update({
      where: { id: datos!.platillo.id },
      data: { nombre: 'Limonada nueva' },
    });
    entrada.ticket.items[0]!.nombre = 'Limonada nueva';
    expect(await service.procesarPago(entrada, usuario)).toEqual(pago);

    const confirmado = await confirmar(where.transaccionId);
    expect(confirmado.estado).toBe(EstadoPago.CONFIRMADO);
    expect(confirmado).not.toHaveProperty('ticketSnapshot');
    const pagoConfirmado = await prisma.pago.findUniqueOrThrow({ where });
    const comprobante = await prisma.comprobante.findUniqueOrThrow({ where });
    expect(pagoConfirmado.ticketSnapshot).toStrictEqual(snapshot);
    expect(comprobante.contenidoSnapshot).toStrictEqual(
      pagoConfirmado.ticketSnapshot,
    );
    expect(comprobante.ticketId).toBe(entrada.ticket.id);
    expect(comprobante.numero).toBe('CP-' + pago.pagoId);
    expect(comprobante.archivoUrl).toBeNull();

    await expect(confirmar(where.transaccionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.cambiarEstadoTransaccion(
      where.transaccionId,
      EstadoTransaccionSimulada.REEMBOLSADO,
    );
    expect((await prisma.pago.findUniqueOrThrow({ where })).estado).toBe(
      EstadoPago.REEMBOLSADO,
    );
    expect(await prisma.comprobante.findUniqueOrThrow({ where })).toStrictEqual(
      comprobante,
    );
  });

  it('emite un solo comprobante ante dos confirmaciones concurrentes', async () => {
    const pago = await service.procesarPago(solicitud(), usuario);
    const where = { transaccionId: pago.transaccionId! };
    const resultados = await Promise.allSettled([
      confirmar(where.transaccionId),
      confirmar(where.transaccionId),
    ]);

    expect(
      resultados.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(resultados).toContainEqual({
      status: 'rejected',
      reason: expect.any(ConflictException),
    });
    expect(await prisma.comprobante.count({ where })).toBe(1);
  });

  it('revierte la confirmación si el número colisiona con un comprobante histórico', async () => {
    const pago = await service.procesarPago(solicitud(), usuario);
    const where = { transaccionId: pago.transaccionId! };
    const anterior = await prisma.pago.create({
      data: {
        pedidoId: datos!.pedido.id,
        idempotencyKey: randomUUID(),
        transaccionId: randomUUID(),
        monto: '4.50',
        estado: EstadoPago.REEMBOLSADO,
      },
    });
    const historico = await prisma.comprobante.create({
      data: {
        numero: 'CP-' + pago.pagoId,
        ticketId: anterior.pedidoId,
        transaccionId: anterior.transaccionId!,
      },
    });

    await expect(confirmar(where.transaccionId)).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(await prisma.pago.findUniqueOrThrow({ where })).toMatchObject({
      estado: EstadoPago.PENDIENTE,
      confirmadoEn: null,
    });
    expect(await prisma.comprobante.findUnique({ where })).toBeNull();
    expect(
      await prisma.comprobante.findUnique({ where: { id: historico.id } }),
    ).toStrictEqual(historico);
  });

  it('rechaza un pago sin emitir comprobante', async () => {
    const pago = await service.procesarPago(solicitud(), usuario);
    const where = { transaccionId: pago.transaccionId! };
    const rechazado = await service.cambiarEstadoTransaccion(
      where.transaccionId,
      EstadoTransaccionSimulada.RECHAZADO,
    );
    expect(rechazado.estado).toBe(EstadoPago.RECHAZADO);
    expect(await prisma.comprobante.findUnique({ where })).toBeNull();
  });

  it('mantiene pendiente un pago sin snapshot y no emite comprobante', async () => {
    const transaccionId = randomUUID();
    await prisma.pago.create({
      data: {
        pedidoId: datos!.pedido.id,
        idempotencyKey: randomUUID(),
        transaccionId,
        monto: '4.50',
      },
    });

    await expect(confirmar(transaccionId)).rejects.toMatchObject({
      status: 409,
      message: 'No se puede confirmar el pago sin su ticket original',
    });
    expect(
      await prisma.pago.findUniqueOrThrow({ where: { transaccionId } }),
    ).toMatchObject({
      estado: EstadoPago.PENDIENTE,
      confirmadoEn: null,
      ticketSnapshot: null,
    });
    expect(
      await prisma.comprobante.findUnique({ where: { transaccionId } }),
    ).toBeNull();
  });
});
