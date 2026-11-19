
import {
  BadRequestException,
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
    
import { PedidosLlevarService } from '../../pedidos/services/pedidos-llevar.service.js';
import { EstadoPago, EstadoPedido, Prisma, Rol, TipoPedido, type User } from '@PrismaClient';
import { ProcesarPagoDto } from '@Pagos/dto';
import { PagoRepository } from '../repositories/pago.repository.js';
import { PagosService } from './pagos.service.js';
import {
  EstadoTransaccionSimulada,
  PasarelaSimuladaService,
} from './pasarela-simulada.service.js';

describe('PagosService - BE-16.1', () => {
  let service: PagosService;

  const usuario = {
    id: 'cliente-test-01',
    rol: Rol.CLIENTE,
  } as User;

  const gerenteGeneral = { rol: Rol.GERENTE_GENERAL } as User;

  const repository = {
    buscarPorSolicitud: vi.fn(),
    buscarPedido: vi.fn(),
    buscarPagoBloqueante: vi.fn(),
    crear: vi.fn(),
    buscarPorTransaccion: vi.fn(),
    obtenerEstado: vi.fn(),
    actualizarEstado: vi.fn(),
    confirmarYEmitirComprobante: vi.fn(),
  };

  const pasarela = {
    procesarPago: vi.fn(),
    cambiarEstado: vi.fn(),
  };

  const datos = {
    solicitudId: 'H16-QA-UNIT-01',
    ticket: {
      id: 54,
      total: 22.48,
      items: [
        {
          nombre: 'Hamburguesa',
          precio_unitario: 8.99,
          cantidad: 2,
          subtotal: 17.98,
        },
        {
          nombre: 'Limonada con soda',
          precio_unitario: 2.25,
          cantidad: 2,
          subtotal: 4.50,
        },
      ],
    },
  };

  const pedido = {
    id: 54,
    tipo: TipoPedido.LLEVAR,
    estado: EstadoPedido.PENDIENTE_PAGO,
    clienteId: 'cliente-test-01',
    total: new Prisma.Decimal('22.48'),
    detalles: [
      {
        cantidad: 2,
        precioUnitario: new Prisma.Decimal('8.99'),
        platillo: { id: 101, nombre: 'Hamburguesa' },
      },
      {
        cantidad: 2,
        precioUnitario: new Prisma.Decimal('2.25'),
        platillo: { id: 102, nombre: 'Limonada con soda' },
      },
    ],
  };

  const pedidosLlevar = {
    confirmarPago: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();

    repository.buscarPorSolicitud.mockResolvedValue(null);
    repository.buscarPedido.mockResolvedValue(pedido);
    repository.buscarPagoBloqueante.mockResolvedValue(null);

    pasarela.procesarPago.mockReturnValue({
      transaccionId: 'transaccion-test-01',
      referencia: '54',
      estado: EstadoTransaccionSimulada.PENDIENTE,
    });

    repository.crear.mockResolvedValue({
      id: 10,
      pedidoId: 54,
      transaccionId: 'transaccion-test-01',
      monto: new Prisma.Decimal('22.48'),
      estado: EstadoPago.PENDIENTE,
    });

    service = new PagosService(
    repository as unknown as PagoRepository,
    pasarela as unknown as PasarelaSimuladaService,
    pedidosLlevar as unknown as PedidosLlevarService,
);
  });

  it('registra un pago cuando la pasarela responde correctamente', async () => {
    const resultado = await service.procesarPago(datos, usuario);

    expect(resultado).toEqual({
      pagoId: 10,
      comprobanteId: null,
      ticketId: 54,
      transaccionId: 'transaccion-test-01',
      estado: EstadoPago.PENDIENTE,
    });

    expect(repository.crear).toHaveBeenCalledExactlyOnceWith({
      pedidoId: 54,
      idempotencyKey: datos.solicitudId,
      transaccionId: 'transaccion-test-01',
      monto: 22.48,
      estado: EstadoPago.PENDIENTE,
      ticketSnapshot: {
        version: 1,
        pedidoId: 54,
        items: [
          { platilloId: 101, nombre: 'Hamburguesa', cantidad: 2, precioUnitario: '8.99', subtotal: '17.98' },
          { platilloId: 102, nombre: 'Limonada con soda', cantidad: 2, precioUnitario: '2.25', subtotal: '4.50' },
        ],
        total: '22.48',
      },
    });
  });

  it('no guarda el ticket si contiene un articulo que no coincide con el pedido', async () => {
    const ticket = {
      ...datos.ticket,
      items: [
        { ...datos.ticket.items[0]!, nombre: 'Otro articulo' },
        datos.ticket.items[1]!,
      ],
    };

    await expect(service.procesarPago({ ...datos, ticket }, usuario))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repository.crear).not.toHaveBeenCalled();
  });

  it.each([null, { version: 1 }])(
    'reutiliza el pago existente sin reescribir su snapshot (%j)',
    async (ticketSnapshot) => {
      repository.buscarPorSolicitud.mockResolvedValue({
        id: 10,
        pedidoId: 54,
        transaccionId: 'transaccion-test-01',
        monto: new Prisma.Decimal('22.48'),
        estado: EstadoPago.PENDIENTE,
        ticketSnapshot,
      });

      await expect(service.procesarPago(datos, usuario)).resolves.toMatchObject({ pagoId: 10 });
      expect(repository.crear).not.toHaveBeenCalled();
      expect(pasarela.procesarPago).not.toHaveBeenCalled();
    },
  );

  it('recupera el pago ganador si dos solicitudes usan la misma clave', async () => {
    repository.buscarPorSolicitud.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 11,
      pedidoId: 54,
      transaccionId: 'transaccion-ganadora',
      monto: new Prisma.Decimal('22.48'),
      estado: EstadoPago.PENDIENTE,
    });
    repository.crear.mockRejectedValue({ code: 'P2002' });

    await expect(service.procesarPago(datos, usuario)).resolves.toMatchObject({
      pagoId: 11,
      transaccionId: 'transaccion-ganadora',
    });
    expect(repository.crear).toHaveBeenCalledOnce();
  });

  it('no registra el pago si la pasarela falla técnicamente', async () => {
    pasarela.procesarPago.mockImplementation(() => {
      throw new ServiceUnavailableException(
        'Pasarela temporalmente no disponible',
      );
    });

    await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(repository.crear).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta sin identificador de transacción', async () => {
    pasarela.procesarPago.mockReturnValue({
      transaccionId: '',
      referencia: '54',
      estado: EstadoTransaccionSimulada.PENDIENTE,
    });

    await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    expect(repository.crear).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta con referencia incorrecta', async () => {
    pasarela.procesarPago.mockReturnValue({
      transaccionId: 'transaccion-test-01',
      referencia: '999',
      estado: EstadoTransaccionSimulada.PENDIENTE,
    });

    await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    expect(repository.crear).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta inicial con estado inesperado', async () => {
    pasarela.procesarPago.mockReturnValue({
      transaccionId: 'transaccion-test-01',
      referencia: '54',
      estado: EstadoTransaccionSimulada.CONFIRMADO,
    });

    await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    expect(repository.crear).not.toHaveBeenCalled();
  });

  it.each([EstadoPago.PENDIENTE, EstadoPago.CONFIRMADO, EstadoPago.REEMBOLSADO])('bloquea un nuevo cobro si hay un pago %s', async (estado) => {
    repository.buscarPagoBloqueante.mockResolvedValue({
      id: 10,
      estado,
    });

    await expect(service.procesarPago(datos, usuario)).rejects.toThrow(
      'El pedido 54 ya tiene un pago en estado ' + estado,
    );

    expect(pasarela.procesarPago).not.toHaveBeenCalled();
    expect(repository.crear).not.toHaveBeenCalled();
  });


    it('maneja una respuesta nula de la pasarela', async () => {
    pasarela.procesarPago.mockReturnValue(null);

    await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
        BadGatewayException,
    );

    expect(repository.crear).not.toHaveBeenCalled();
    });

    describe('BE-16.2 - Consulta y actualización de transacciones', () => {
    const transaccionId = 'transaccion-test-01';

    const pago = {
      id: 10,
      pedidoId: 54,
      transaccionId,
      monto: new Prisma.Decimal('22.48'),
      estado: EstadoPago.PENDIENTE,
      confirmadoEn: null,
      reembolsadoEn: null,
      pedido: {
        tipo: TipoPedido.LLEVAR,
      },
    };

    it('consulta correctamente una transacción existente', async () => {
        repository.obtenerEstado.mockResolvedValue(pago);

        const resultado =
        await service.consultarTransaccion(transaccionId, gerenteGeneral);

        const { pedido: _pedido, ...datosPago } = pago;
        expect(resultado).toEqual({ ...datosPago, comprobanteId: null });
        expect(repository.obtenerEstado).toHaveBeenCalledWith(
        transaccionId,
        );
    });

    it('rechaza la consulta de una transacción inexistente', async () => {
        repository.obtenerEstado.mockResolvedValue(null);

        await expect(
        service.consultarTransaccion('inexistente', gerenteGeneral),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualiza una transacción de PENDIENTE a CONFIRMADO', async () => {
        repository.buscarPorTransaccion.mockResolvedValue(pago);
        repository.confirmarYEmitirComprobante.mockResolvedValue({ count: 1 });

        const pagoConfirmado = {
        ...pago,
        estado: EstadoPago.CONFIRMADO,
        confirmadoEn: new Date(),
        };

        repository.obtenerEstado.mockResolvedValue(pagoConfirmado);

        const resultado = await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO, gerenteGeneral
        );

        expect(pasarela.cambiarEstado).toHaveBeenCalledWith(
        EstadoPago.PENDIENTE,
        EstadoTransaccionSimulada.CONFIRMADO,
        );

        expect(repository.confirmarYEmitirComprobante).toHaveBeenCalledWith(
        transaccionId,
        EstadoPago.PENDIENTE,
        );
        expect(repository.actualizarEstado).not.toHaveBeenCalled();

        expect(resultado.estado).toBe(EstadoPago.CONFIRMADO);
    });

    it('notifica a H05 al confirmar un pedido para llevar', async () => {
      repository.buscarPorTransaccion.mockResolvedValue(pago);
      repository.confirmarYEmitirComprobante.mockResolvedValue({ count: 1 });
      repository.obtenerEstado.mockResolvedValue({
        ...pago,
        estado: EstadoPago.CONFIRMADO,
      });

      await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO, gerenteGeneral
      );

      expect(pedidosLlevar.confirmarPago).toHaveBeenCalledOnce();
      expect(pedidosLlevar.confirmarPago).toHaveBeenCalledWith(54);
    });

    it('no notifica a H05 cuando el pedido no es para llevar', async () => {
      repository.buscarPorTransaccion.mockResolvedValue({
        ...pago,
        pedido: {
          tipo: TipoPedido.MESA,
        },
      });

      repository.confirmarYEmitirComprobante.mockResolvedValue({ count: 1 });

      repository.obtenerEstado.mockResolvedValue({
        ...pago,
        estado: EstadoPago.CONFIRMADO,
      });

      await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO, gerenteGeneral
      );

      expect(pedidosLlevar.confirmarPago).not.toHaveBeenCalled();
    });


    it('rechaza cambios de estado si la transacción no existe', async () => {
        repository.buscarPorTransaccion.mockResolvedValue(null);

        await expect(
        service.cambiarEstadoTransaccion(
            'inexistente',
            EstadoTransaccionSimulada.CONFIRMADO, gerenteGeneral
        ),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(repository.confirmarYEmitirComprobante).not.toHaveBeenCalled();
    });

    it('detecta una modificación concurrente del estado', async () => {
        repository.buscarPorTransaccion.mockResolvedValue(pago);

        // Otro proceso modificó el estado antes de actualizar
        repository.confirmarYEmitirComprobante.mockResolvedValue({ count: 0 });

        await expect(
        service.cambiarEstadoTransaccion(
            transaccionId,
            EstadoTransaccionSimulada.CONFIRMADO, gerenteGeneral
        ),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(repository.confirmarYEmitirComprobante).toHaveBeenCalledWith(
        transaccionId,
        EstadoPago.PENDIENTE,
        );
    });

    it('propaga el fallo de emisión antes de notificar a H05', async () => {
      const error = new Error('Falló la emisión');
      repository.buscarPorTransaccion.mockResolvedValue(pago);
      repository.confirmarYEmitirComprobante.mockRejectedValue(error);

      await expect(service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO,
      )).rejects.toBe(error);
      expect(pedidosLlevar.confirmarPago).not.toHaveBeenCalled();
      expect(repository.obtenerEstado).not.toHaveBeenCalled();
    });
    });

    it('rechaza un pago de un pedido cancelado', async () => {
        repository.buscarPedido.mockResolvedValue({
          ...pedido,
          estado: EstadoPedido.CANCELADO,
        });

        await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
          ConflictException,
        );

        expect(pasarela.procesarPago).not.toHaveBeenCalled();
        expect(repository.crear).not.toHaveBeenCalled();
      });

      it('rechaza pagar un pedido para llevar que ya fue recibido', async () => {
        repository.buscarPedido.mockResolvedValue({
          ...pedido,
          estado: EstadoPedido.RECIBIDO,
        });

        await expect(service.procesarPago(datos, usuario)).rejects.toBeInstanceOf(
          ConflictException,
        );

        expect(pasarela.procesarPago).not.toHaveBeenCalled();
        expect(repository.crear).not.toHaveBeenCalled();
      });

    it('rechaza pagar un pedido de otro cliente', async () => {
      repository.buscarPedido.mockResolvedValue({
        ...pedido,
        clienteId: 'otro-cliente',
      });

      await expect(
        service.procesarPago(datos, usuario),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(pasarela.procesarPago).not.toHaveBeenCalled();
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('rechaza reintentos idempotentes de pedidos ajenos', async () => {
      repository.buscarPedido.mockResolvedValue({
        ...pedido,
        clienteId: 'otro-cliente',
      });

      repository.buscarPorSolicitud.mockResolvedValue({
        id: 10,
        pedidoId: 54,
        monto: new Prisma.Decimal('22.48'),
        estado: EstadoPago.PENDIENTE,
        transaccionId: 'transaccion-test-01',
      });

      await expect(
        service.procesarPago(datos, usuario),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.buscarPorSolicitud).not.toHaveBeenCalled();
      expect(pasarela.procesarPago).not.toHaveBeenCalled();
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('rechaza a un mesero de otra sucursal', async () => {
    repository.buscarPedido.mockResolvedValue({
      ...pedido,
      tipo: TipoPedido.MESA,
      sucursalId: 2,
    });

    const mesero = {
      id: 'mesero-test-01',
      rol: Rol.MESERO,
      sucursalId: 1,
    } as User;

    await expect(
      service.procesarPago(datos, mesero),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(pasarela.procesarPago).not.toHaveBeenCalled();
    expect(repository.crear).not.toHaveBeenCalled();
  });



  it('permite a un mesero pagar pedidos de su sucursal', async () => {
    repository.buscarPedido.mockResolvedValue({
      ...pedido,
      tipo: TipoPedido.MESA,
      estado: EstadoPedido.ENTREGADO,
      sucursalId: 1,
    });

    const mesero = {
      id: 'mesero-test-01',
      rol: Rol.MESERO,
      sucursalId: 1,
    } as User;

    const resultado = await service.procesarPago(datos, mesero);

    expect(resultado.estado).toBe(EstadoPago.PENDIENTE);
    expect(pasarela.procesarPago).toHaveBeenCalledOnce();
    expect(repository.crear).toHaveBeenCalledOnce();
  });


  it('rechaza a un mesero de otra sucursal', async () => {
    repository.buscarPedido.mockResolvedValue({
      ...pedido,
      tipo: TipoPedido.MESA,
      sucursalId: 2,
    });

    const mesero = {
      id: 'mesero-test-01',
      rol: Rol.MESERO,
      sucursalId: 1,
    } as User;

    await expect(
      service.procesarPago(datos, mesero),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(pasarela.procesarPago).not.toHaveBeenCalled();
    expect(repository.crear).not.toHaveBeenCalled();
  });

  it('permite a un mesero pagar pedidos de su sucursal', async () => {
    repository.buscarPedido.mockResolvedValue({
      ...pedido,
      tipo: TipoPedido.MESA,
      estado: EstadoPedido.ENTREGADO,
      sucursalId: 1,
    });

    const mesero = {
      id: 'mesero-test-01',
      rol: Rol.MESERO,
      sucursalId: 1,
    } as User;

    const resultado = await service.procesarPago(datos, mesero);

    expect(resultado.estado).toBe(EstadoPago.PENDIENTE);
    expect(pasarela.procesarPago).toHaveBeenCalledOnce();
    expect(repository.crear).toHaveBeenCalledOnce();
  });

  it('permite reintentar un pago con total entero', async () => {
    const datosEnteros: ProcesarPagoDto = {
      solicitudId: 'H16-QA-ENTERO-01',
      ticket: {
        id: 54,
        total: 17,
        items: [
          {
            nombre: 'Hamburguesa',
            precio_unitario: 17,
            cantidad: 1,
            subtotal: 17,
          },
        ],
      },
    };

    repository.buscarPorSolicitud.mockResolvedValue({
      id: 10,
      pedidoId: 54,
      transaccionId: 'transaccion-test-01',
      monto: new Prisma.Decimal('17'),
      estado: EstadoPago.PENDIENTE,
    });

    const resultado = await service.procesarPago(
      datosEnteros,
      usuario,
    );

    expect(resultado.pagoId).toBe(10);
    expect(resultado.estado).toBe(EstadoPago.PENDIENTE);
    expect(pasarela.procesarPago).not.toHaveBeenCalled();
    expect(repository.crear).not.toHaveBeenCalled();
  });

  describe('cobro de mesa en efectivo', () => {
    const mesero = { rol: Rol.MESERO, sucursalId: 1 } as User;
    beforeEach(() => {
      repository.buscarPedido.mockResolvedValue({
        ...pedido,
        tipo: TipoPedido.MESA,
        estado: EstadoPedido.ENTREGADO,
        sucursalId: 1,
      });
    });

    it.each([['22.48', '0.00'], ['25', '2.52']])(
      'confirma al recibir %s y calcula cambio %s',
      async (montoRecibido, cambio) => {
        repository.crear.mockResolvedValue({
          id: 10, pedidoId: 54, estado: EstadoPago.CONFIRMADO, comprobante: { id: 12 },
        });
        await expect(service.procesarPago({ ...datos, metodo: 'EFECTIVO', montoRecibido }, mesero))
          .resolves.toMatchObject({ estado: EstadoPago.CONFIRMADO, comprobanteId: 12 });
        expect(repository.crear).toHaveBeenCalledWith(expect.objectContaining({
          metodo: 'EFECTIVO',
          monto: new Prisma.Decimal('22.48'),
          estado: EstadoPago.CONFIRMADO,
          detallePago: { montoRecibido: new Prisma.Decimal(montoRecibido).toFixed(2), cambio },
        }));
        expect(pasarela.procesarPago).not.toHaveBeenCalled();
      },
    );

    it('rechaza efectivo insuficiente', async () => {
      await expect(service.procesarPago({
        ...datos, metodo: 'EFECTIVO', montoRecibido: '22.47',
      }, mesero)).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it.each([EstadoPedido.LISTO, EstadoPedido.CERRADO])('rechaza un nuevo cobro en %s', async (estado) => {
      repository.buscarPedido.mockResolvedValue({
        ...pedido, tipo: TipoPedido.MESA, sucursalId: 1, estado,
      });
      await expect(service.procesarPago(datos, mesero)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('recupera un cobro concurrente con la misma solicitud sin duplicarlo', async () => {
      repository.buscarPorSolicitud.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 10, pedidoId: 54, monto: pedido.total, estado: EstadoPago.CONFIRMADO,
        metodo: 'EFECTIVO', detallePago: { montoRecibido: '25.00', cambio: '2.52' },
        comprobante: { id: 12 },
      });
      repository.crear.mockRejectedValue(new ConflictException());
      await expect(service.procesarPago({
        ...datos, metodo: 'EFECTIVO', montoRecibido: '25.00',
      }, mesero)).resolves.toMatchObject({ pagoId: 10, comprobanteId: 12 });
      expect(repository.crear).toHaveBeenCalledOnce();
      expect(pasarela.procesarPago).not.toHaveBeenCalled();
    });
  });

  it('permite consultar cobros MESA de la sucursal y protege las demas transacciones', async () => {
    const mesero = { rol: Rol.MESERO, sucursalId: 1 } as User;
    const transaccion = {
      estado: EstadoPago.CONFIRMADO, comprobante: { id: 12 },
      pedido: { tipo: TipoPedido.MESA, sucursalId: 1 },
    };
    repository.obtenerEstado.mockResolvedValueOnce(transaccion)
      .mockResolvedValueOnce({ ...transaccion, pedido: { ...transaccion.pedido, sucursalId: 2 } })
      .mockResolvedValueOnce({ ...transaccion, pedido: { ...transaccion.pedido, tipo: TipoPedido.LLEVAR } });
    await expect(service.consultarTransaccion('t1', mesero))
      .resolves.toEqual({ estado: EstadoPago.CONFIRMADO, comprobanteId: 12 });
    await expect(service.consultarTransaccion('t2', mesero)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.consultarTransaccion('t3', mesero)).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('alcance de las transacciones', () => {
    const gerente = { rol: Rol.GERENTE, sucursalId: 1 } as User;
    const mesero = { rol: Rol.MESERO, sucursalId: 1 } as User;
    const transaccion = {
      metodo: 'TARJETA',
      estado: EstadoPago.PENDIENTE,
      pedido: { sucursalId: 2, tipo: TipoPedido.MESA },
    };

    beforeEach(() => {
      repository.buscarPorTransaccion.mockResolvedValue(transaccion);
      repository.obtenerEstado.mockResolvedValue(transaccion);
    });

    it('impide que un gerente consulte o cambie pagos de otra sucursal', async () => {
      await expect(service.consultarTransaccion('t', gerente)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.cambiarEstadoTransaccion('t', EstadoTransaccionSimulada.CONFIRMADO, gerente))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(pasarela.cambiarEstado).not.toHaveBeenCalled();
      expect(repository.confirmarYEmitirComprobante).not.toHaveBeenCalled();
    });

    it('permite a un gerente consultar y rechazar una tarjeta de su sucursal', async () => {
      const local = { ...transaccion, pedido: { ...transaccion.pedido, sucursalId: 1 } };
      repository.buscarPorTransaccion.mockResolvedValue(local);
      repository.obtenerEstado.mockResolvedValueOnce(local).mockResolvedValueOnce({ ...local, estado: EstadoPago.RECHAZADO });
      repository.actualizarEstado.mockResolvedValue({ count: 1 });
      await expect(service.consultarTransaccion('t', gerente)).resolves.toMatchObject({ estado: EstadoPago.PENDIENTE });
      await expect(service.cambiarEstadoTransaccion('t', EstadoTransaccionSimulada.RECHAZADO, gerente))
        .resolves.toMatchObject({ estado: EstadoPago.RECHAZADO });
      expect(repository.confirmarYEmitirComprobante).not.toHaveBeenCalled();
    });

    it('rechaza al cliente y al mesero en el cambio de estado aunque invoquen el servicio', async () => {
      await expect(service.consultarTransaccion('t', usuario)).rejects.toBeInstanceOf(ForbiddenException);
      for (const actor of [usuario, mesero]) {
        await expect(service.cambiarEstadoTransaccion('t', EstadoTransaccionSimulada.CONFIRMADO, actor))
          .rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(repository.obtenerEstado).not.toHaveBeenCalled();
      expect(repository.buscarPorTransaccion).not.toHaveBeenCalled();
    });

    it('impide cambiar un cobro en efectivo mediante el simulador', async () => {
      repository.buscarPorTransaccion.mockResolvedValue({ ...transaccion, metodo: 'EFECTIVO', estado: EstadoPago.CONFIRMADO });
      await expect(service.cambiarEstadoTransaccion('t', EstadoTransaccionSimulada.REEMBOLSADO, gerenteGeneral))
        .rejects.toBeInstanceOf(ConflictException);
      expect(pasarela.cambiarEstado).not.toHaveBeenCalled();
      expect(repository.actualizarEstado).not.toHaveBeenCalled();
    });
  });

  it('solo permite al cliente propietario iniciar un nuevo cobro para llevar', async () => {
    const gerente = { rol: Rol.GERENTE_GENERAL } as User;
    await expect(service.procesarPago(datos, gerente)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.crear).not.toHaveBeenCalled();
  });

  it('recupera H05 cuando se repite la solicitud de un pago confirmado', async () => {
    repository.buscarPorSolicitud.mockResolvedValue({
      id: 10, pedidoId: 54, monto: pedido.total, estado: EstadoPago.CONFIRMADO,
      comprobante: { id: 12 },
    });
    pedidosLlevar.confirmarPago.mockRejectedValueOnce(new Error('H05 temporalmente no disponible'));
    await expect(service.procesarPago(datos, usuario)).rejects.toThrow('H05');
    await expect(service.procesarPago(datos, usuario)).resolves.toMatchObject({
      pagoId: 10, estado: EstadoPago.CONFIRMADO, comprobanteId: 12,
    });
    expect(pedidosLlevar.confirmarPago).toHaveBeenCalledTimes(2);
    expect(repository.crear).not.toHaveBeenCalled();
  });

  it('permite un nuevo intento de tarjeta despues de un rechazo', async () => {
    const transaccionId = 'anterior';
    repository.buscarPorTransaccion.mockResolvedValue({
      estado: EstadoPago.PENDIENTE, pedido: { tipo: TipoPedido.LLEVAR },
    });
    repository.actualizarEstado.mockResolvedValue({ count: 1 });
    repository.obtenerEstado.mockResolvedValue({ estado: EstadoPago.RECHAZADO, pedido: { tipo: TipoPedido.LLEVAR, sucursalId: 1 } });
    await service.cambiarEstadoTransaccion(transaccionId, EstadoTransaccionSimulada.RECHAZADO, gerenteGeneral);
    expect(repository.confirmarYEmitirComprobante).not.toHaveBeenCalled();
    expect(pedidosLlevar.confirmarPago).not.toHaveBeenCalled();

    const nuevo = {
      ...datos, solicitudId: 'otro-intento', metodo: 'TARJETA' as const,
      marca: 'VISA', ultimosCuatro: '4242',
    };
    await expect(service.procesarPago(nuevo, usuario)).resolves.toMatchObject({
      estado: EstadoPago.PENDIENTE, comprobanteId: null,
    });
    expect(repository.crear).toHaveBeenCalledWith(expect.objectContaining({
      detallePago: { marca: 'VISA', ultimosCuatro: '4242' },
    }));
  });

  it('permite pagar un pedido de mesa entregado', async () => {
    repository.buscarPedido.mockResolvedValue({
      ...pedido,
      tipo: TipoPedido.MESA,
      estado: EstadoPedido.ENTREGADO,
      sucursalId: 1,
    });

    const mesero = {
      id: 'mesero-test-01',
      rol: Rol.MESERO,
      sucursalId: 1,
    } as User;

    const resultado = await service.procesarPago(datos, mesero);

    expect(resultado.estado).toBe(EstadoPago.PENDIENTE);
    expect(pasarela.procesarPago).toHaveBeenCalledOnce();
    expect(repository.crear).toHaveBeenCalledOnce();
  });

});
