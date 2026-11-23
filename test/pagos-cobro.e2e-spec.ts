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
import { ItemNoPendienteError, PedidoFueraDeCocinaError } from '@Cocina/errors';
import { PedidoCocinaRepository } from '../src/cocina/repositories/pedido-cocina.repository.js';
import { ComprobantesRepository } from '../src/comprobantes/repositories/comprobantes.repository.js';
import { ComprobantePdfGenerator } from '../src/comprobantes/services/comprobante-pdf.generator.js';
import { ComprobantesService } from '../src/comprobantes/services/comprobantes.service.js';
import { PagoRepository } from '../src/pagos/repositories/pago.repository.js';
import { ResolucionTarjetasService } from '../src/pagos/services/resolucion-tarjetas.service.js';
import { PagosService } from '../src/pagos/services/pagos.service.js';
import {
  EstadoTransaccionSimulada,
  PasarelaSimuladaService,
} from '../src/pagos/services/pasarela-simulada.service.js';
import { PedidosLlevarRepository } from '../src/pedidos/repositories/pedidos-llevar.repository.js';
import { EntregasRepository } from '../src/mesero/repositories/entregas.repository.js';
import { EntregasService } from '../src/mesero/services/entregas.service.js';
import { puntosPendientes } from '../src/lealtad/utils/puntos.js';
import { PedidosRepository } from '../src/pedidos/repositories/pedidos.repository.js';
import { PedidosLlevarService } from '../src/pedidos/services/pedidos-llevar.service.js';
import { PedidosService } from '../src/pedidos/services/pedidos.service.js';

// Usar solo una base de pruebas aislada con migraciones aplicadas.
const databaseUrl = process.env.PAGOS_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('H16/H17 cobro en PostgreSQL', () => {
  let prisma: PrismaClient;
  let pagos: PagosService;
  let repositorio: PagoRepository;
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
    repositorio = new PagoRepository(db, comprobantes);
    pagos = new PagosService(
      repositorio,
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

  it('lista cobros de la sucursal y mantiene ocupada la mesa hasta cerrar todos sus pedidos', async () => {
    const orden = await pedido(TipoPedido.MESA);
    const llevar = await pedido(TipoPedido.LLEVAR);
    const otraSucursal = await prisma.sucursal.create({ data: { nombre: randomUUID() } });
    const mesaId = orden.mesaId!;
    const mesero = { rol: Rol.MESERO, sucursalId } as typeof gerente;
    const entregas = new EntregasService(new EntregasRepository(prisma as PrismaService), {} as never);
    const pedidosRepo = new PedidosRepository(prisma as PrismaService);
    const listar = () => entregas.listarPedidosPendientesDeCobro(mesero);
    const ocupacion = (id = orden.id) => pedidosRepo.buscarPedidoAbierto(mesaId).then(
      (abierto) => expect(abierto?.id).toBe(id),
    );
    const confirmar = (id: string) =>
      pagos.cambiarEstadoTransaccion(id, EstadoTransaccionSimulada.CONFIRMADO, gerente);

    try {
      await prisma.pedido.update({
        where: { id: llevar.id },
        data: { estado: EstadoPedido.ENTREGADO },
      });
      expect(await listar()).toEqual([expect.objectContaining({ pedidoId: orden.id, puedeCobrar: true })]);
      expect(await entregas.listarPedidosPendientesDeCobro({ ...mesero, sucursalId: otraSucursal.id })).toEqual([]);
      await ocupacion();

      const pendiente = await pagos.procesarPago(solicitud(orden.id), mesero);
      expect(await listar()).toEqual([
        expect.objectContaining({ pedidoId: orden.id, puedeCobrar: false, pagoBloqueante: EstadoPago.PENDIENTE }),
      ]);
      await ocupacion();

      await pagos.cambiarEstadoTransaccion(
        pendiente.transaccionId!,
        EstadoTransaccionSimulada.RECHAZADO,
        gerente,
      );
      expect(await listar()).toEqual([expect.objectContaining({ pedidoId: orden.id, puedeCobrar: true })]);
      await ocupacion();

      const segundo = await prisma.pedido.create({
        data: { tipo: TipoPedido.MESA, sucursalId, mesaId, estado: EstadoPedido.EN_PREPARACION },
      });
      const reintento = await pagos.procesarPago(solicitud(orden.id), mesero);
      await confirmar(reintento.transaccionId!);
      const tarjetaNueva = expect.objectContaining({
        pedidoId: segundo.id, puedeCobrar: false, comprobanteId: null,
      });
      expect(await listar()).toEqual([tarjetaNueva]);
      // También contempla datos históricos con un pago confirmado y el pedido aún entregado.
      await prisma.pedido.update({
        where: { id: orden.id },
        data: { estado: EstadoPedido.ENTREGADO },
      });
      expect(await listar()).toEqual([tarjetaNueva]);
      await ocupacion(segundo.id);
      expect(await pedidosRepo.buscarPedidosAbiertos([mesaId])).toEqual([{ id: segundo.id, mesaId }]);

      // Si el pedido histórico sigue ENTREGADO después del reembolso, tampoco ocupa la mesa.
      await pagos.cambiarEstadoTransaccion(
        reintento.transaccionId!,
        EstadoTransaccionSimulada.REEMBOLSADO,
        gerente,
      );
      expect(await listar()).toEqual([tarjetaNueva]);
      await ocupacion(segundo.id);

      await prisma.pedido.update({
        where: { id: segundo.id },
        data: {
          estado: EstadoPedido.ENTREGADO,
          subtotal: '17.50',
          total: '17.50',
          detalles: {
            create: { platilloId, cantidad: 1, precioUnitario: '17.50', estado: EstadoItem.ENTREGADO },
          },
        },
      });
      await ocupacion(segundo.id);
      const ultimo = await pagos.procesarPago(solicitud(segundo.id), mesero);
      await confirmar(ultimo.transaccionId!);
      expect(await listar()).toEqual([expect.objectContaining({
        pedidoId: segundo.id, puedeCobrar: false, comprobanteId: expect.any(Number),
      })]);
      expect(await pedidosRepo.buscarPedidoAbierto(mesaId)).toBeNull();
      expect(await pedidosRepo.buscarPedidosAbiertos([mesaId])).toEqual([]);
    } finally {
      await prisma.sucursal.delete({ where: { id: otraSucursal.id } });
    }
  });

  it('valida el correo H18 antes de cobrar y acumula solo al confirmar', async () => {
    const orden = await pedido(TipoPedido.MESA);
    const ordenEfectivo = await pedido(TipoPedido.MESA);
    const cliente = await prisma.user.findUniqueOrThrow({ where: { id: clienteId } });
    const regla = await prisma.reglaPuntos.create({ data: { puntosPorDolar: 2 } });
    const correoLealtad = cliente.email.toUpperCase();
    const movimientos = () => prisma.movimientoPuntos.findMany({ where: { pedidoId: orden.id } });
    try {
      await expect(pagos.procesarPago({
        ...solicitud(orden.id), correoLealtad: 'inexistente@example.test',
      }, gerente)).rejects.toThrow(/cliente registrado y habilitado/);
      expect(await prisma.pago.count({ where: { pedidoId: orden.id } })).toBe(0);

      const rechazado = await pagos.procesarPago({ ...solicitud(orden.id), correoLealtad }, gerente);
      await pagos.cambiarEstadoTransaccion(rechazado.transaccionId!, EstadoTransaccionSimulada.RECHAZADO, gerente);
      expect(await movimientos()).toEqual([]);

      const pendiente = await pagos.procesarPago({ ...solicitud(orden.id), correoLealtad }, gerente);
      expect(await movimientos()).toEqual([]);
      const confirmado = await pagos.cambiarEstadoTransaccion(pendiente.transaccionId!, EstadoTransaccionSimulada.CONFIRMADO, gerente);
      const cuenta = await prisma.cuentaPuntos.findUniqueOrThrow({ where: { clienteId } });
      expect(cuenta.saldo).toBe(35);
      expect(await puntosPendientes(prisma, cuenta.id, new Date())).toBe(35);
      expect((await comprobantes.descargarPdf(confirmado.comprobanteId!, gerente)).buffer.subarray(0, 4).toString()).toBe('%PDF');

      await pagos.cambiarEstadoTransaccion(pendiente.transaccionId!, EstadoTransaccionSimulada.REEMBOLSADO, gerente);
      expect(await puntosPendientes(prisma, cuenta.id, new Date())).toBe(0);
      expect((await prisma.cuentaPuntos.findUniqueOrThrow({ where: { clienteId } })).saldo).toBe(0);

      const efectivo = await pagos.procesarPago({
        solicitudId: randomUUID(),
        ticket: solicitud(ordenEfectivo.id).ticket,
        metodo: 'EFECTIVO',
        montoRecibido: '20.00',
        correoLealtad,
      }, gerente);
      expect(efectivo.estado).toBe(EstadoPago.CONFIRMADO);
      expect(await puntosPendientes(prisma, cuenta.id, new Date())).toBe(35);
      expect(await puntosPendientes(prisma, cuenta.id, new Date(Date.now() + 24 * 60 * 60 * 1000))).toBe(0);
    } finally {
      await prisma.movimientoPuntos.deleteMany({ where: { pedidoId: { in: [orden.id, ordenEfectivo.id] } } });
      await prisma.cuentaPuntos.deleteMany({ where: { clienteId } });
      await prisma.reglaPuntos.delete({ where: { id: regla.id } });
    }
  });

  it('cocina cierra LLEVAR pagado solo al completar el ultimo item y conserva el PDF', async () => {
    const orden = await pedido(TipoPedido.LLEVAR);
    const cliente = { rol: Rol.CLIENTE, id: clienteId } as typeof gerente;
    const entrada = solicitud(orden.id);
    await prisma.pedido.update({
      where: { id: orden.id },
      data: {
        total: 35,
        subtotal: 35,
        detalles: {
          create: { platilloId, cantidad: 1, precioUnitario: '17.50' },
        },
      },
    });
    entrada.ticket.total = 35;
    entrada.ticket.items.push({ ...entrada.ticket.items[0]! });
    const pago = await pagos.procesarPago(entrada, cliente);
    await pagos.cambiarEstadoTransaccion(
      pago.transaccionId!,
      EstadoTransaccionSimulada.CONFIRMADO,
      gerente,
    );
    const [primero, ultimo] = await prisma.detallePedido.findMany({
      where: { pedidoId: orden.id },
      orderBy: { id: 'asc' },
    });
    const cocina = new PedidoCocinaRepository(prisma as PrismaService);
    expect(await cocina.marcarItemListo(primero.id, sucursalId)).toMatchObject({
      pedidoEstado: EstadoPedido.RECIBIDO,
      pedidoCompletado: false,
    });
    const resultados = await Promise.allSettled([
      cocina.marcarItemListo(ultimo.id, sucursalId),
      cocina.marcarItemListo(ultimo.id, sucursalId),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toEqual([
      expect.objectContaining({
        value: expect.objectContaining({ pedidoEstado: EstadoPedido.CERRADO }),
      }),
    ]);
    await expect(
      cocina.marcarItemListo(ultimo.id, sucursalId),
    ).rejects.toBeInstanceOf(ItemNoPendienteError);
    const seguimiento = await llevar.obtenerSeguimiento(orden.id, cliente);
    expect(seguimiento).toMatchObject({
      estado: EstadoPedido.CERRADO,
      pago: EstadoPago.CONFIRMADO,
      comprobanteId: expect.any(Number),
    });
    const pdf = await comprobantes.descargarPdf(
      seguimiento.comprobanteId!,
      cliente,
    );
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(await prisma.pago.count({ where: { pedidoId: orden.id } })).toBe(1);
    expect(
      await prisma.comprobante.count({ where: { ticketId: orden.id } }),
    ).toBe(1);
  });

  it('mantiene LLEVAR sin pago confirmado en LISTO y lo cierra al confirmar el pago existente', async () => {
    const orden = await pedido(TipoPedido.LLEVAR);
    const cliente = { rol: Rol.CLIENTE, id: clienteId } as typeof gerente;
    const pago = await pagos.procesarPago(solicitud(orden.id), cliente);
    // Caso historico con preparacion iniciada y pago previo aun pendiente.
    await prisma.pedido.update({
      where: { id: orden.id },
      data: { estado: EstadoPedido.EN_PREPARACION },
    });
    const item = await prisma.detallePedido.findFirstOrThrow({
      where: { pedidoId: orden.id },
    });
    const cocina = new PedidoCocinaRepository(prisma as PrismaService);
    expect(await cocina.marcarItemListo(item.id, sucursalId)).toMatchObject({
      pedidoEstado: EstadoPedido.LISTO,
    });
    expect(
      await prisma.comprobante.count({ where: { ticketId: orden.id } }),
    ).toBe(0);
    await pagos.cambiarEstadoTransaccion(
      pago.transaccionId!,
      EstadoTransaccionSimulada.CONFIRMADO,
      gerente,
    );
    expect(await llevar.obtenerSeguimiento(orden.id, cliente)).toMatchObject({
      estado: EstadoPedido.CERRADO,
      pago: EstadoPago.CONFIRMADO,
      comprobanteId: expect.any(Number),
    });
  });

  it.each([EstadoPedido.EN_PREPARACION, EstadoPedido.CANCELADO])(
    'cocina preserva las reglas MESA en %s',
    async (estado) => {
      const orden = await pedido(TipoPedido.MESA);
      await prisma.pedido.update({ where: { id: orden.id }, data: { estado } });
      await prisma.detallePedido.updateMany({
        where: { pedidoId: orden.id },
        data: { estado: EstadoItem.PENDIENTE },
      });
      const item = await prisma.detallePedido.findFirstOrThrow({
        where: { pedidoId: orden.id },
      });
      const cocina = new PedidoCocinaRepository(prisma as PrismaService);
      if (estado === EstadoPedido.CANCELADO) {
        await expect(
          cocina.marcarItemListo(item.id, sucursalId),
        ).rejects.toBeInstanceOf(PedidoFueraDeCocinaError);
        expect(
          await prisma.detallePedido.findUnique({ where: { id: item.id } }),
        ).toMatchObject({ estado: EstadoItem.PENDIENTE });
      } else {
        // Incluso con un pago confirmado de prueba, cocina no cierra MESA.
        await prisma.pago.create({
          data: {
            pedidoId: orden.id,
            idempotencyKey: randomUUID(),
            monto: '17.50',
            estado: EstadoPago.CONFIRMADO,
          },
        });
        expect(await cocina.marcarItemListo(item.id, sucursalId)).toMatchObject(
          { pedidoEstado: EstadoPedido.LISTO },
        );
      }
    },
  );

  it('recupera por pedido el ultimo rechazo, un pago pendiente, el confirmado y el reembolsado', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const otroPedido = await pedido(TipoPedido.MESA);
    const mesero = { rol: Rol.MESERO, sucursalId } as typeof gerente;
    expect(await pagos.consultarPorPedido(mesa.id, mesero)).toEqual({
      pago: null,
    });

    const intento = await pagos.procesarPago(solicitud(mesa.id), gerente);
    await pagos.cambiarEstadoTransaccion(
      intento.transaccionId!,
      EstadoTransaccionSimulada.RECHAZADO,
      gerente,
    );
    expect(await pagos.consultarPorPedido(mesa.id, mesero)).toMatchObject({
      pagoId: intento.pagoId,
      estado: EstadoPago.RECHAZADO,
      comprobanteId: null,
    });

    const nuevo = await pagos.procesarPago(solicitud(mesa.id), gerente);
    expect(await pagos.consultarPorPedido(mesa.id, mesero)).toEqual({
      pagoId: nuevo.pagoId,
      pedidoId: mesa.id,
      transaccionId: nuevo.transaccionId,
      estado: EstadoPago.PENDIENTE,
      metodo: 'TARJETA',
      comprobanteId: null,
    });
    expect(await pagos.consultarPorPedido(otroPedido.id, mesero)).toEqual({
      pago: null,
    });
    const confirmado = await pagos.cambiarEstadoTransaccion(
      nuevo.transaccionId!,
      EstadoTransaccionSimulada.CONFIRMADO,
      gerente,
    );
    await prisma.pago.create({
      data: {
        pedidoId: mesa.id,
        idempotencyKey: randomUUID(),
        monto: 1,
        estado: EstadoPago.RECHAZADO,
        creadoEn: new Date(Date.now() + 1000),
      },
    });
    expect(await pagos.consultarPorPedido(mesa.id, mesero)).toMatchObject({
      pagoId: nuevo.pagoId,
      estado: EstadoPago.CONFIRMADO,
      comprobanteId: confirmado.comprobanteId,
    });
    expect(confirmado.comprobanteId).toEqual(expect.any(Number));
    await pagos.cambiarEstadoTransaccion(
      nuevo.transaccionId!,
      EstadoTransaccionSimulada.REEMBOLSADO,
      gerente,
    );
    expect(await pagos.consultarPorPedido(mesa.id, mesero)).toMatchObject({
      pagoId: nuevo.pagoId,
      estado: EstadoPago.REEMBOLSADO,
      comprobanteId: confirmado.comprobanteId,
    });
  });

  it('retoma una tarjeta persistida tras reiniciar y dos trabajadores emiten un solo comprobante', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const datos = solicitud(mesa.id);
    vi.stubEnv('H16_SIMULADOR_RETRASO_MS', undefined);
    vi.stubEnv('H16_SIMULADOR_RESULTADO', 'CONFIRMADO');
    try {
      const inicio = await pagos.procesarPago(datos, gerente);
      expect(inicio).toMatchObject({
        estado: EstadoPago.PENDIENTE,
        comprobanteId: null,
      });
      const primerProceso = new ResolucionTarjetasService(repositorio, pagos);
      await primerProceso.procesarLote();
      expect(
        (await prisma.pago.findUniqueOrThrow({ where: { id: inicio.pagoId } }))
          .estado,
      ).toBe(EstadoPago.PENDIENTE);

      const persistido = await prisma.pago.findUniqueOrThrow({
        where: { id: inicio.pagoId },
      });
      await prisma.pago.update({
        where: { id: inicio.pagoId },
        data: { creadoEn: new Date(persistido.creadoEn.getTime() - 11000) },
      });
      const reiniciado = new PagosService(
        new PagoRepository(prisma as PrismaService, comprobantes),
        new PasarelaSimuladaService(),
        llevar,
      );
      await Promise.all([
        new ResolucionTarjetasService(repositorio, reiniciado).procesarLote(),
        new ResolucionTarjetasService(repositorio, pagos).procesarLote(),
      ]);
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: mesa.id } }))
          .estado,
      ).toBe(EstadoPedido.CERRADO);
      expect(
        await prisma.comprobante.count({ where: { ticketId: mesa.id } }),
      ).toBe(1);
      const recuperado = await reiniciado.procesarPago(datos, gerente);
      expect(recuperado).toMatchObject({
        pagoId: inicio.pagoId,
        estado: EstadoPago.CONFIRMADO,
        comprobanteId: expect.any(Number),
      });
      const id = recuperado.comprobanteId!;
      const antes = await prisma.comprobante.findUniqueOrThrow({
        where: { id },
      });
      expect(antes.primeraGeneracionPdfEn).toBeNull();
      const { buffer } = await comprobantes.descargarPdf(id, gerente);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      const despues = await prisma.comprobante.findUniqueOrThrow({
        where: { id },
      });
      expect(despues.primeraGeneracionPdfEn).toBeInstanceOf(Date);
      expect(await prisma.pago.count({ where: { pedidoId: mesa.id } })).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rechaza automaticamente una tarjeta en pruebas y permite un nuevo intento', async () => {
    vi.stubEnv('H16_SIMULADOR_RESULTADO', 'RECHAZADO');
    vi.stubEnv('H16_SIMULADOR_RETRASO_MS', '0');
    try {
      const mesa = await pedido(TipoPedido.MESA);
      const inicio = await pagos.procesarPago(solicitud(mesa.id), gerente);
      await new ResolucionTarjetasService(repositorio, pagos).procesarLote();
      expect(
        await pagos.consultarTransaccion(inicio.transaccionId!, gerente),
      ).toMatchObject({
        estado: EstadoPago.RECHAZADO,
        comprobanteId: null,
      });
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: mesa.id } }))
          .estado,
      ).toBe(EstadoPedido.ENTREGADO);
      expect(
        await prisma.comprobante.count({ where: { ticketId: mesa.id } }),
      ).toBe(0);
      const nuevo = await pagos.procesarPago(solicitud(mesa.id), gerente);
      expect(nuevo.pagoId).not.toBe(inicio.pagoId);
      // El intento nuevo se conserva para el escenario PENDIENTE de pruebas.
      vi.stubEnv('H16_SIMULADOR_RESULTADO', 'PENDIENTE');
      await new ResolucionTarjetasService(repositorio, pagos).procesarLote();
      expect(
        await pagos.consultarTransaccion(nuevo.transaccionId!, gerente),
      ).toMatchObject({
        estado: EstadoPago.PENDIENTE,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reintenta H05 desde un trabajador nuevo cuando su primer llamado falla', async () => {
    vi.stubEnv('H16_SIMULADOR_RETRASO_MS', '0');
    vi.stubEnv('H16_SIMULADOR_RESULTADO', 'CONFIRMADO');
    const fallo = vi
      .spyOn(llevar, 'confirmarPago')
      .mockRejectedValueOnce(new Error('fallo H05'));
    try {
      const orden = await pedido(TipoPedido.LLEVAR);
      const cliente = { id: clienteId, rol: Rol.CLIENTE } as typeof gerente;
      const inicio = await pagos.procesarPago(solicitud(orden.id), cliente);
      await new ResolucionTarjetasService(repositorio, pagos).procesarLote();
      expect(await llevar.obtenerSeguimiento(orden.id, cliente)).toMatchObject({
        estado: EstadoPedido.PENDIENTE_PAGO,
        pago: EstadoPago.CONFIRMADO,
        comprobanteId: expect.any(Number),
      });
      await new ResolucionTarjetasService(repositorio, pagos).procesarLote();
      expect(await llevar.obtenerSeguimiento(orden.id, cliente)).toMatchObject({
        estado: EstadoPedido.RECIBIDO,
        pago: EstadoPago.CONFIRMADO,
      });
      expect(await prisma.pago.count({ where: { pedidoId: orden.id } })).toBe(
        1,
      );
      expect(
        await prisma.comprobante.count({ where: { ticketId: orden.id } }),
      ).toBe(1);
      expect(inicio.estado).toBe(EstadoPago.PENDIENTE);
    } finally {
      fallo.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('no persiste tarjeta si MESA cambia a PENDIENTE_PAGO entre la lectura y el bloqueo', async () => {
    const mesa = await pedido(TipoPedido.MESA);
    const crear = repositorio.crear.bind(repositorio);
    const cambiar = vi
      .spyOn(repositorio, 'crear')
      .mockImplementationOnce(async (datos) => {
        await prisma.pedido.update({
          where: { id: mesa.id },
          // Conserva la marca para ejercitar de forma independiente el par tipo/estado.
          data: {
            estado: EstadoPedido.PENDIENTE_PAGO,
            actualizadoEn: mesa.actualizadoEn,
          },
        });
        return crear(datos);
      });
    try {
      await expect(
        pagos.procesarPago(solicitud(mesa.id), gerente),
      ).rejects.toMatchObject({ status: 409 });
      expect(await prisma.pago.count({ where: { pedidoId: mesa.id } })).toBe(0);
    } finally {
      cambiar.mockRestore();
    }
  });

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
