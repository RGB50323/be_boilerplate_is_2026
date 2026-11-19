import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EstadoItem,
  EstadoPago,
  EstadoPedido,
  PrismaClient,
  Rol,
  TipoPedido,
} from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { ComprobantesRepository } from '../src/comprobantes/repositories/comprobantes.repository.js';
import { ComprobantePdfGenerator } from '../src/comprobantes/services/comprobante-pdf.generator.js';
import { ComprobantesService } from '../src/comprobantes/services/comprobantes.service.js';
import { PagoRepository } from '../src/pagos/repositories/pago.repository.js';
import { PagosService } from '../src/pagos/services/pagos.service.js';
import {
  EstadoTransaccionSimulada,
  PasarelaSimuladaService,
} from '../src/pagos/services/pasarela-simulada.service.js';
import { PedidosLlevarRepository } from '../src/pedidos/repositories/pedidos-llevar.repository.js';
import { PedidosLlevarService } from '../src/pedidos/services/pedidos-llevar.service.js';
import { PedidosService } from '../src/pedidos/services/pedidos.service.js';

// Usar solo una base de pruebas aislada con migraciones aplicadas.
const databaseUrl = process.env.PAGOS_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('H16/H17 cobro en PostgreSQL', () => {
  let prisma: PrismaClient;
  let pagos: PagosService;
  let comprobantes: ComprobantesService;
  let llevar: PedidosLlevarService;
  let sucursalId: number;
  let platilloId: number;
  let categoriaId: number;
  let clienteId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    const modulo = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        ComprobantesRepository,
        ComprobantesService,
        ComprobantePdfGenerator,
      ],
    }).compile();
    comprobantes = modulo.get(ComprobantesService);
    const db = prisma as PrismaService;
    llevar = new PedidosLlevarService(
      new PedidosLlevarRepository(db),
      {} as PedidosService,
    );
    pagos = new PagosService(
      new PagoRepository(db, comprobantes),
      new PasarelaSimuladaService(),
      llevar,
    );
    const sucursal = await prisma.sucursal.create({
      data: { nombre: randomUUID() },
    });
    sucursalId = sucursal.id;
    const platillo = await prisma.platillo.create({
      data: {
        nombre: 'Limonada',
        categoria: { create: { nombre: randomUUID() } },
      },
    });
    platilloId = platillo.id;
    categoriaId = platillo.categoriaId;
    const cliente = await prisma.user.create({
      data: {
        email: randomUUID() + '@example.test',
        passwordHash: 'fixture',
        rol: Rol.CLIENTE,
      },
    });
    clienteId = cliente.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (sucursalId) {
        await prisma.$transaction([
          prisma.comprobante.deleteMany({ where: { pedido: { sucursalId } } }),
          prisma.pago.deleteMany({ where: { pedido: { sucursalId } } }),
          prisma.pedido.deleteMany({ where: { sucursalId } }),
          prisma.mesa.deleteMany({ where: { sucursalId } }),
          prisma.sucursal.delete({ where: { id: sucursalId } }),
        ]);
      }
      if (clienteId) await prisma.user.delete({ where: { id: clienteId } });
      if (platilloId)
        await prisma.platillo.delete({ where: { id: platilloId } });
      if (categoriaId)
        await prisma.categoria.delete({ where: { id: categoriaId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function pedido(tipo: TipoPedido) {
    const mesa =
      tipo === TipoPedido.MESA
        ? await prisma.mesa.create({
            data: {
              sucursalId,
              numero: (await prisma.mesa.count({ where: { sucursalId } })) + 1,
            },
          })
        : null;
    return prisma.pedido.create({
      data: {
        tipo,
        sucursalId,
        mesaId: mesa?.id,
        clienteId: mesa ? null : clienteId,
        nombreCliente: mesa ? null : 'Cliente Pruebas',
        estado: mesa ? EstadoPedido.ENTREGADO : EstadoPedido.PENDIENTE_PAGO,
        subtotal: '17.50',
        total: '17.50',
        detalles: {
          create: {
            platilloId,
            cantidad: 1,
            precioUnitario: '17.50',
            estado: mesa ? EstadoItem.ENTREGADO : EstadoItem.PENDIENTE,
          },
        },
      },
    });
  }

  function solicitud(id: number) {
    return {
      solicitudId: randomUUID(),
      metodo: 'TARJETA' as const,
      marca: 'VISA',
      ultimosCuatro: '4242',
      ticket: {
        id,
        total: 17.5,
        items: [
          {
            nombre: 'Limonada',
            cantidad: 1,
            precio_unitario: 17.5,
            subtotal: 17.5,
          },
        ],
      },
    };
  }

  const gerente = { rol: Rol.GERENTE_GENERAL } as Parameters<
    PagosService['procesarPago']
  >[1];

  it('confirma un solo efectivo concurrente, cierra MESA y conserva las copias historicas', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const efectivo = {
      ...solicitud(mesa.id),
      metodo: 'EFECTIVO' as const,
      montoRecibido: '20.00',
      marca: undefined,
      ultimosCuatro: undefined,
    };
    const [a, b] = await Promise.all([
      pagos.procesarPago(efectivo, gerente),
      pagos.procesarPago(efectivo, gerente),
    ]);
    expect(a).toEqual(b);
    await expect(
      pagos.procesarPago({ ...efectivo, solicitudId: randomUUID() }, gerente),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await prisma.pedido.findUniqueOrThrow({ where: { id: mesa.id } }))
        .estado,
    ).toBe(EstadoPedido.CERRADO);
    const registros = await prisma.pago.findMany({
      where: { pedidoId: mesa.id },
      include: { comprobante: true },
    });
    expect(registros).toHaveLength(1);
    const [registro] = registros;
    expect(registro).toMatchObject({
      estado: EstadoPago.CONFIRMADO,
      detallePago: { montoRecibido: '20.00', cambio: '2.50' },
      comprobante: {
        primeraGeneracionPdfEn: null,
        contenidoSnapshot: registro.ticketSnapshot,
        detallePago: registro.detallePago,
      },
    });
  });

  it('deja MESA entregada si tarjeta queda pendiente o rechazada y cierra al confirmar un nuevo intento', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const { transaccionId } = await pagos.procesarPago(
      solicitud(mesa.id),
      gerente,
    );
    const estadoPedido = async () =>
      (await prisma.pedido.findUniqueOrThrow({ where: { id: mesa.id } }))
        .estado;
    expect(await estadoPedido()).toBe(EstadoPedido.ENTREGADO);
    await pagos.cambiarEstadoTransaccion(
      transaccionId!,
      EstadoTransaccionSimulada.RECHAZADO,
      gerente,
    );
    expect(await estadoPedido()).toBe(EstadoPedido.ENTREGADO);
    expect(
      await prisma.comprobante.count({ where: { ticketId: mesa.id } }),
    ).toBe(0);

    const otro = await pagos.procesarPago(solicitud(mesa.id), gerente);
    const resultados = await Promise.allSettled([
      pagos.cambiarEstadoTransaccion(
        otro.transaccionId!,
        EstadoTransaccionSimulada.CONFIRMADO,
        gerente,
      ),
      pagos.cambiarEstadoTransaccion(
        otro.transaccionId!,
        EstadoTransaccionSimulada.CONFIRMADO,
        gerente,
      ),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await estadoPedido()).toBe(EstadoPedido.CERRADO);
    const historico = await prisma.comprobante.findUniqueOrThrow({
      where: { transaccionId: otro.transaccionId! },
    });
    expect(historico.detallePago).toEqual({
      marca: 'VISA',
      ultimosCuatro: '4242',
    });
  });

  it('bloquea cobros concurrentes con claves distintas', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const resultados = await Promise.allSettled([
      pagos.procesarPago(solicitud(mesa.id), gerente),
      pagos.procesarPago(solicitud(mesa.id), gerente),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.pago.count({ where: { pedidoId: mesa.id } })).toBe(1);
  });

  it('revierte el cobro y el cierre si falla la emision', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const error = vi
      .spyOn(comprobantes, 'emitir')
      .mockRejectedValueOnce(new Error('fallo H17'));
    try {
      await expect(
        pagos.procesarPago(
          {
            solicitudId: randomUUID(),
            ticket: solicitud(mesa.id).ticket,
            metodo: 'EFECTIVO',
            montoRecibido: '17.50',
          },
          gerente,
        ),
      ).rejects.toThrow('fallo H17');
      expect(await prisma.pago.count({ where: { pedidoId: mesa.id } })).toBe(0);
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: mesa.id } }))
          .estado,
      ).toBe(EstadoPedido.ENTREGADO);
    } finally {
      error.mockRestore();
    }
  });

  it('recupera LLEVAR sin volver a cobrar si falla su paso a RECIBIDO', async () => {
    const orden = await pedido(TipoPedido.LLEVAR);
    const cliente = { rol: Rol.CLIENTE, id: clienteId } as typeof gerente;
    const datos = solicitud(orden.id);
    const inicial = await pagos.procesarPago(datos, cliente);
    const falloH05 = vi
      .spyOn(llevar, 'confirmarPago')
      .mockRejectedValueOnce(new Error('fallo H05'));
    try {
      await expect(
        pagos.cambiarEstadoTransaccion(
          inicial.transaccionId!,
          EstadoTransaccionSimulada.CONFIRMADO,
          gerente,
        ),
      ).rejects.toThrow('fallo H05');
      expect(await llevar.obtenerSeguimiento(orden.id, cliente)).toMatchObject({
        estado: EstadoPedido.PENDIENTE_PAGO,
        pago: EstadoPago.CONFIRMADO,
      });
      const recuperado = await pagos.procesarPago(datos, cliente);
      expect(recuperado).toMatchObject({
        pagoId: inicial.pagoId,
        estado: EstadoPago.CONFIRMADO,
        comprobanteId: expect.any(Number),
      });
      expect(await llevar.obtenerSeguimiento(orden.id, cliente)).toMatchObject({
        estado: EstadoPedido.RECIBIDO,
        comprobanteId: recuperado.comprobanteId,
      });
      expect(await prisma.pago.count({ where: { pedidoId: orden.id } })).toBe(
        1,
      );
    } finally {
      falloH05.mockRestore();
    }
  });
});
