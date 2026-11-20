import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvConfig } from '@Config';
import {
  EstadoAcreditacionPuntos,
  EstadoItem,
  EstadoPago,
  EstadoPedido,
  PrismaClient,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import { UserRepository } from '@Users/repositories';
import { UsersService } from '@Users/services';
import { esDestinoLocal } from '../prisma/destinos-base.js';
import { ReglaPuntosService } from '../src/beneficios/services/regla-puntos.service.js';
import { ComprobantesRepository } from '../src/comprobantes/repositories/comprobantes.repository.js';
import { ComprobantesService } from '../src/comprobantes/services/comprobantes.service.js';
import { PagoRepository } from '../src/pagos/repositories/pago.repository.js';
import { PagosService } from '../src/pagos/services/pagos.service.js';
import {
  EstadoTransaccionSimulada,
  PasarelaSimuladaService,
} from '../src/pagos/services/pasarela-simulada.service.js';
import { PedidosLlevarRepository } from '../src/pedidos/repositories/pedidos-llevar.repository.js';
import { PedidosLlevarService } from '../src/pedidos/services/pedidos-llevar.service.js';
import type { PedidosService } from '../src/pedidos/services/pedidos.service.js';
import { crearAcreditacionesPruebas } from './crear-acreditaciones-pruebas.js';

const url = process.env.H18_TEST_DATABASE_URL;
const DIA = 24 * 60 * 60 * 1000;
const nuevoCorreo = () => randomUUID() + '@example.test';

describe.skipIf(!url)('H18 con la cadena de pagos y PostgreSQL', () => {
  let prisma: PrismaClient;
  let sucursalId: number;
  let platilloId: number;
  let gerente: User;
  let mesero: User;
  let numeroMesa = 0;
  let pagos: PagosService;
  let repositorio: PagoRepository;
  let acreditaciones: ReturnType<typeof crearAcreditacionesPruebas>;
  let reglas: ReglaPuntosService;
  let usuarios: UsersService;

  beforeAll(async () => {
    if (!url || !esDestinoLocal(url) || new URL(url).pathname !== '/h18_test') {
      throw new Error(
        'H18 requiere una base local aislada h18_test recién migrada.',
      );
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    if (await prisma.reglaPuntos.count())
      throw new Error('La base H18 debe estar recién migrada.');
    const db = prisma as PrismaService;
    acreditaciones = crearAcreditacionesPruebas(db);
    reglas = new ReglaPuntosService(db);
    repositorio = new PagoRepository(
      db,
      new ComprobantesService(new ComprobantesRepository()),
      acreditaciones,
    );
    pagos = new PagosService(
      repositorio,
      new PasarelaSimuladaService(),
      new PedidosLlevarService(
        new PedidosLlevarRepository(db),
        {} as PedidosService,
      ),
    );
    usuarios = new UsersService(new UserRepository(db), {
      get: () => 4,
    } as unknown as ConfigService<EnvConfig, true>);
    sucursalId = (
      await prisma.sucursal.create({ data: { nombre: randomUUID() } })
    ).id;
    platilloId = (
      await prisma.platillo.create({
        data: {
          nombre: 'Limonada',
          categoria: { create: { nombre: randomUUID() } },
        },
      })
    ).id;
    gerente = await prisma.user.create({
      data: {
        email: nuevoCorreo(),
        passwordHash: 'fixture',
        rol: Rol.GERENTE_GENERAL,
      },
    });
    mesero = await prisma.user.create({
      data: {
        email: nuevoCorreo(),
        passwordHash: 'fixture',
        rol: Rol.MESERO,
        sucursalId,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function pedido(total: number, clienteId?: string) {
    const mesa = clienteId
      ? null
      : await prisma.mesa.create({
          data: { sucursalId, numero: ++numeroMesa },
        });
    const orden = await prisma.pedido.create({
      data: {
        tipo: mesa ? TipoPedido.MESA : TipoPedido.LLEVAR,
        estado: mesa ? EstadoPedido.ENTREGADO : EstadoPedido.PENDIENTE_PAGO,
        sucursalId,
        mesaId: mesa?.id,
        clienteId,
        subtotal: total,
        total,
        detalles: {
          create: {
            platilloId,
            cantidad: 1,
            precioUnitario: total,
            estado: mesa ? EstadoItem.ENTREGADO : EstadoItem.PENDIENTE,
          },
        },
      },
    });
    return {
      solicitudId: randomUUID(),
      ticket: {
        id: orden.id,
        total,
        items: [
          {
            nombre: 'Limonada',
            precio_unitario: total,
            cantidad: 1,
            subtotal: total,
          },
        ],
      },
    };
  }

  const efectivo = { metodo: 'EFECTIVO', montoRecibido: '100' } as const;
  const tarjeta = {
    metodo: 'TARJETA',
    marca: 'VISA',
    ultimosCuatro: '4242',
  } as const;
  const porPago = (pagoId: number) =>
    prisma.acreditacionPuntos.findUniqueOrThrow({
      where: { pagoId },
      include: { cuenta: true },
    });
  const confirmar = (id: string) =>
    pagos.resolverTarjetaSimulada(id, EstadoTransaccionSimulada.CONFIRMADO);
  const reembolsar = (id: string) =>
    pagos.cambiarEstadoTransaccion(
      id,
      EstadoTransaccionSimulada.REEMBOLSADO,
      gerente,
    );

  const registrarCliente = () =>
    usuarios.create({ email: nuevoCorreo(), password: 'Una clave cualquiera' });

  it('omite lealtad en MESA anónimo e inicializa una sola regla para dos cobros simultáneos', async () => {
    const sinCorreo = await pagos.procesarPago(
      { ...(await pedido(4)), ...efectivo },
      mesero,
    );
    expect(sinCorreo.estado).toBe(EstadoPago.CONFIRMADO);
    expect(await prisma.acreditacionPuntos.count()).toBe(0);
    expect(await prisma.cuentaPuntos.count()).toBe(0);
    expect(await reglas.consultarVigente()).toBeNull();

    const cliente = await registrarCliente();
    const entrada = {
      ...(await pedido(10.75)),
      ...efectivo,
      correoLealtad: cliente.email.toUpperCase(),
    };
    const otro = {
      ...(await pedido(0.75)),
      ...efectivo,
      correoLealtad: cliente.email,
    };
    const [primero, segundo] = await Promise.all([
      pagos.procesarPago(entrada, mesero),
      pagos.procesarPago(otro, mesero),
    ]);
    const regla = await reglas.consultarVigente();
    expect(regla).toMatchObject({ puntosPorDolar: 1 });
    expect(await prisma.reglaPuntos.count()).toBe(1);
    const a = await porPago(primero.pagoId);
    const b = await porPago(segundo.pagoId);
    expect(a).toMatchObject({
      estado: EstadoAcreditacionPuntos.PENDIENTE,
      puntos: 10,
      reglaId: regla?.id,
    });
    expect(a.puntosExactos.toString()).toBe('10.75');
    expect(b).toMatchObject({
      cuentaPuntosId: a.cuentaPuntosId,
      puntos: 0,
      reglaId: regla?.id,
    });
    expect(
      await prisma.cuentaPuntos.count({ where: { clienteId: cliente.id } }),
    ).toBe(1);
    expect(a.cuenta.saldo).toBe(0);
    expect(a.liberableEn.getTime() - a.confirmadoEn.getTime()).toBe(DIA);
    expect(Math.abs(Date.now() - a.confirmadoEn.getTime())).toBeLessThan(
      10_000,
    );
    expect(primero.comprobanteId).not.toBeNull();
    expect(
      await prisma.pedido.findUnique({ where: { id: entrada.ticket.id } }),
    ).toMatchObject({ clienteId: null });
    expect(
      await prisma.pago.findUnique({ where: { id: primero.pagoId } }),
    ).toMatchObject({
      correoLealtad: cliente.email,
      clienteLealtadId: cliente.id,
    });
    await expect(
      pagos.procesarPago({ ...entrada, correoLealtad: cliente.email }, mesero),
    ).resolves.toEqual(primero);
    await expect(
      pagos.procesarPago({ ...entrada, correoLealtad: nuevoCorreo() }, mesero),
    ).rejects.toMatchObject({ status: 409 });

    await acreditaciones.liberarVencidas(
      new Date(Math.max(a.liberableEn.getTime(), b.liberableEn.getTime())),
    );
    expect(await porPago(segundo.pagoId)).toMatchObject({
      estado: EstadoAcreditacionPuntos.LIBERADA,
      puntos: 0,
      cuenta: { saldo: 10 },
    });
    expect(
      await prisma.movimientoPuntos.count({
        where: { cuentaPuntosId: a.cuentaPuntosId },
      }),
    ).toBe(1);
  });

  it('rechaza correos desconocidos, roles ajenos y clientes o cuentas inactivos antes de cobrar', async () => {
    const inactivo = await registrarCliente();
    await prisma.user.update({
      where: { id: inactivo.id },
      data: { isActive: false },
    });
    const cuentaInactiva = await registrarCliente();
    await prisma.cuentaPuntos.create({
      data: { clienteId: cuentaInactiva.id, activa: false },
    });
    const desconocido = nuevoCorreo();

    for (const [correo, mensaje] of [
      [desconocido, /no corresponde a un cliente registrado/],
      [mesero.email, /no corresponde a un cliente registrado/],
      [inactivo.email, /no está habilitado/],
      [cuentaInactiva.email, /no está habilitado/],
    ] as const) {
      const entrada = {
        ...(await pedido(4)),
        ...tarjeta,
        correoLealtad: correo,
      };
      const iniciar = vi.spyOn(
        PasarelaSimuladaService.prototype,
        'procesarPago',
      );
      try {
        await expect(pagos.procesarPago(entrada, mesero)).rejects.toThrow(
          mensaje,
        );
        expect(iniciar).not.toHaveBeenCalled();
      } finally {
        iniciar.mockRestore();
      }
      expect(
        await prisma.pago.count({ where: { pedidoId: entrada.ticket.id } }),
      ).toBe(0);
    }
    expect(await prisma.user.count({ where: { email: desconocido } })).toBe(0);
    expect(
      await prisma.cuentaPuntos.count({ where: { clienteId: inactivo.id } }),
    ).toBe(0);
    const llevar = { ...(await pedido(4, cuentaInactiva.id)), ...tarjeta };
    await expect(
      pagos.procesarPago(llevar, cuentaInactiva),
    ).rejects.toMatchObject({ status: 400 });
  });

  describe('con tasa configurada', () => {
    beforeEach(async () => {
      await reglas.confirmar(2, gerente.id);
    });

    it('crea una sola cuenta en confirmaciones concurrentes con una regla configurada', async () => {
      const cliente = await registrarCliente();
      const entradas = await Promise.all([pedido(5), pedido(7)]);
      const intentos = await Promise.all(
        entradas.map((entrada) =>
          pagos.procesarPago(
            { ...entrada, ...tarjeta, correoLealtad: cliente.email },
            mesero,
          ),
        ),
      );
      expect(
        await prisma.cuentaPuntos.findUnique({
          where: { clienteId: cliente.id },
        }),
      ).toBeNull();
      await Promise.all(intentos.map((pago) => confirmar(pago.transaccionId!)));
      const acreditadas = await Promise.all(
        intentos.map((pago) => porPago(pago.pagoId)),
      );
      expect(acreditadas.map((fila) => fila.puntos)).toEqual([10, 14]);
      expect(acreditadas[0].cuentaPuntosId).toBe(acreditadas[1].cuentaPuntosId);
      expect(
        await prisma.cuentaPuntos.count({ where: { clienteId: cliente.id } }),
      ).toBe(1);
    });

    it('crea la cuenta de un titular LLEVAR, conserva H05 y fija una sola regla al confirmar tarjeta', async () => {
      const cliente = await usuarios.create({
        email: nuevoCorreo(),
        password: 'Una clave cualquiera',
      });
      const entrada = { ...(await pedido(6, cliente.id)), ...tarjeta };
      await expect(
        pagos.procesarPago(
          { ...entrada, correoLealtad: nuevoCorreo() },
          cliente,
        ),
      ).rejects.toMatchObject({ status: 400 });
      const pago = await pagos.procesarPago(entrada, cliente);
      expect(
        await prisma.cuentaPuntos.findUnique({
          where: { clienteId: cliente.id },
        }),
      ).toBeNull();
      const regla = await reglas.confirmar(3, gerente.id);
      await Promise.all([
        confirmar(pago.transaccionId!),
        confirmar(pago.transaccionId!),
      ]);
      const acreditacion = await porPago(pago.pagoId);
      expect(acreditacion).toMatchObject({
        puntos: 18,
        reglaId: regla.id,
        cuenta: { clienteId: cliente.id, saldo: 0 },
      });
      expect(
        await prisma.acreditacionPuntos.count({
          where: { pagoId: pago.pagoId },
        }),
      ).toBe(1);
      expect(
        await prisma.pedido.findUnique({ where: { id: entrada.ticket.id } }),
      ).toMatchObject({ estado: EstadoPedido.RECIBIDO });
      const otra = await pagos.procesarPago(
        { ...(await pedido(6)), ...efectivo, correoLealtad: cliente.email },
        mesero,
      );
      expect(await porPago(otra.pagoId)).toMatchObject({
        cuentaPuntosId: acreditacion.cuentaPuntosId,
      });
      await reglas.confirmar(4, gerente.id);
      expect(await porPago(pago.pagoId)).toMatchObject({
        puntos: 18,
        reglaId: regla.id,
      });
    });

    it('cancela un reembolso temprano, conserva el cálculo original y omite pagos rechazados', async () => {
      const cliente = await usuarios.create({
        email: nuevoCorreo(),
        password: 'Una clave cualquiera',
      });
      const pagar = async () =>
        pagos.procesarPago(
          {
            ...(await pedido(8)),
            ...tarjeta,
            correoLealtad: cliente.email,
          },
          mesero,
        );
      const rechazado = await pagar();
      expect(
        await prisma.cuentaPuntos.findUnique({
          where: { clienteId: cliente.id },
        }),
      ).toBeNull();
      await pagos.resolverTarjetaSimulada(
        rechazado.transaccionId!,
        EstadoTransaccionSimulada.RECHAZADO,
      );
      expect(
        await prisma.acreditacionPuntos.findUnique({
          where: { pagoId: rechazado.pagoId },
        }),
      ).toBeNull();
      expect(
        await prisma.cuentaPuntos.findUnique({
          where: { clienteId: cliente.id },
        }),
      ).toBeNull();
      const pago = await pagar();
      await confirmar(pago.transaccionId!);
      const antes = await porPago(pago.pagoId);
      const fallo = vi
        .spyOn(acreditaciones, 'cancelarPendiente')
        .mockRejectedValueOnce(new Error('falló la cancelación'));
      try {
        await expect(reembolsar(pago.transaccionId!)).rejects.toThrow(
          'falló la cancelación',
        );
        expect(
          await prisma.pago.findUnique({ where: { id: pago.pagoId } }),
        ).toMatchObject({
          estado: EstadoPago.CONFIRMADO,
          reembolsadoEn: null,
        });
        expect(await porPago(pago.pagoId)).toMatchObject({
          estado: EstadoAcreditacionPuntos.PENDIENTE,
        });
      } finally {
        fallo.mockRestore();
      }
      await reembolsar(pago.transaccionId!);
      const despues = await porPago(pago.pagoId);
      expect(despues).toMatchObject({
        puntos: 0,
        puntosExactos: antes.puntosExactos,
        estado: EstadoAcreditacionPuntos.CANCELADA,
        cuenta: { saldo: 0 },
      });
      expect(despues.canceladaEn!.getTime()).toBeLessThan(
        despues.liberableEn.getTime(),
      );
    });

    it('libera exactamente una vez un reembolso al vencer, incluso si aún no corrió el cron', async () => {
      const pago = await pagos.procesarPago(
        {
          ...(await pedido(9)),
          ...tarjeta,
          correoLealtad: (await registrarCliente()).email,
        },
        mesero,
      );
      await confirmar(pago.transaccionId!);
      const antes = await porPago(pago.pagoId);
      const liberableEn = new Date(Date.now() - 1_000);
      const confirmadoEn = new Date(liberableEn.getTime() - DIA);
      const where = { pagoId: pago.pagoId };
      await prisma.$transaction([
        prisma.acreditacionPuntos.update({
          where,
          data: { confirmadoEn, liberableEn },
        }),
        prisma.pago.update({
          where: { id: pago.pagoId },
          data: { confirmadoEn },
        }),
      ]);
      await acreditaciones.liberarVencidas(new Date(liberableEn.getTime() - 1));
      expect(await porPago(pago.pagoId)).toMatchObject({
        estado: EstadoAcreditacionPuntos.PENDIENTE,
        cuenta: { saldo: 0 },
      });

      await reembolsar(pago.transaccionId!);
      expect(await porPago(pago.pagoId)).toMatchObject({
        estado: EstadoAcreditacionPuntos.PENDIENTE,
      });
      await Promise.all([
        acreditaciones.liberarVencidas(liberableEn),
        acreditaciones.liberarVencidas(liberableEn),
      ]);
      expect(await porPago(pago.pagoId)).toMatchObject({
        estado: EstadoAcreditacionPuntos.LIBERADA,
        liberadaEn: liberableEn,
        cuenta: { saldo: antes.puntos },
      });
      expect(
        await prisma.movimientoPuntos.findMany({
          where: { cuentaPuntosId: antes.cuentaPuntosId },
        }),
      ).toMatchObject([
        {
          puntos: antes.puntos,
          saldoAnterior: 0,
          saldoResultante: antes.puntos,
          reglaId: antes.reglaId,
        },
      ]);
    });

    it('conserva el saldo si el reembolso compite con el cron o sucede tras liberar', async () => {
      for (const concurrente of [true, false]) {
        const pago = await pagos.procesarPago(
          {
            ...(await pedido(12)),
            ...tarjeta,
            correoLealtad: (await registrarCliente()).email,
          },
          mesero,
        );
        await confirmar(pago.transaccionId!);
        const liberableEn = new Date(Date.now() - 1_000);
        await prisma.acreditacionPuntos.update({
          where: { pagoId: pago.pagoId },
          data: {
            liberableEn,
            confirmadoEn: new Date(liberableEn.getTime() - DIA),
          },
        });
        const liberar = acreditaciones.liberarVencidas(liberableEn);
        if (!concurrente) await liberar;
        await Promise.all([liberar, reembolsar(pago.transaccionId!)]);
        expect(await porPago(pago.pagoId)).toMatchObject({
          estado: EstadoAcreditacionPuntos.LIBERADA,
          canceladaEn: null,
          puntos: 24,
          cuenta: { saldo: 24 },
        });
      }
    });

    it('redondea las fracciones y revierte efectivo, comprobante y cuenta si falla la acreditación', async () => {
      const pago = await pagos.procesarPago(
        {
          ...(await pedido(2.25)),
          ...efectivo,
          correoLealtad: (await registrarCliente()).email,
        },
        mesero,
      );
      const fraccion = await porPago(pago.pagoId);
      expect(fraccion.puntosExactos.toString()).toBe('4.5');
      expect(fraccion.puntos).toBe(4);
      await acreditaciones.liberarVencidas(fraccion.liberableEn);
      expect(await porPago(pago.pagoId)).toMatchObject({
        estado: EstadoAcreditacionPuntos.LIBERADA,
        cuenta: { saldo: 4 },
      });

      const cliente = await registrarCliente();
      const entrada = {
        ...(await pedido(4)),
        ...efectivo,
        correoLealtad: cliente.email,
      };
      const fallo = vi
        .spyOn(acreditaciones, 'registrarConfirmacion')
        .mockRejectedValueOnce(new Error('fallo de prueba'));
      try {
        await expect(pagos.procesarPago(entrada, mesero)).rejects.toThrow(
          'fallo de prueba',
        );
        expect(
          await prisma.cuentaPuntos.findUnique({
            where: { clienteId: cliente.id },
          }),
        ).toBeNull();
        expect(
          await prisma.pago.count({ where: { pedidoId: entrada.ticket.id } }),
        ).toBe(0);
        expect(
          await prisma.comprobante.count({
            where: { ticketId: entrada.ticket.id },
          }),
        ).toBe(0);
        expect(
          await prisma.pedido.findUnique({ where: { id: entrada.ticket.id } }),
        ).toMatchObject({ estado: EstadoPedido.ENTREGADO });
      } finally {
        fallo.mockRestore();
      }
    });
  });
});
