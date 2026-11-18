
import {
  BadGatewayException,
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

  const repository = {
    buscarPorSolicitud: vi.fn(),
    buscarPedido: vi.fn(),
    buscarPagoBloqueante: vi.fn(),
    crear: vi.fn(),
    buscarPorTransaccion: vi.fn(),
    obtenerEstado: vi.fn(),
    actualizarEstado: vi.fn(),
  };

  const pasarela = {
    procesarPago: vi.fn(),
    cambiarEstado: vi.fn(),
  };

  const datos: ProcesarPagoDto = {
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
        platillo: { nombre: 'Hamburguesa' },
      },
      {
        cantidad: 2,
        precioUnitario: new Prisma.Decimal('2.25'),
        platillo: { nombre: 'Limonada con soda' },
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
      ticketId: 54,
      transaccionId: 'transaccion-test-01',
      estado: EstadoPago.PENDIENTE,
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

  it('no ejecuta la pasarela si el pedido tiene un pago bloqueante', async () => {
    repository.buscarPagoBloqueante.mockResolvedValue({
      id: 10,
      estado: EstadoPago.REEMBOLSADO,
    });

    await expect(service.procesarPago(datos, usuario)).rejects.toThrow(
      'El pedido 54 ya tiene un pago en estado REEMBOLSADO',
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
        await service.consultarTransaccion(transaccionId);

        expect(resultado).toEqual(pago);
        expect(repository.obtenerEstado).toHaveBeenCalledWith(
        transaccionId,
        );
    });

    it('rechaza la consulta de una transacción inexistente', async () => {
        repository.obtenerEstado.mockResolvedValue(null);

        await expect(
        service.consultarTransaccion('inexistente'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualiza una transacción de PENDIENTE a CONFIRMADO', async () => {
        repository.buscarPorTransaccion.mockResolvedValue(pago);
        repository.actualizarEstado.mockResolvedValue({ count: 1 });

        const pagoConfirmado = {
        ...pago,
        estado: EstadoPago.CONFIRMADO,
        confirmadoEn: new Date(),
        };

        repository.obtenerEstado.mockResolvedValue(pagoConfirmado);

        const resultado = await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO,
        );

        expect(pasarela.cambiarEstado).toHaveBeenCalledWith(
        EstadoPago.PENDIENTE,
        EstadoTransaccionSimulada.CONFIRMADO,
        );

        expect(repository.actualizarEstado).toHaveBeenCalledWith(
        transaccionId,
        EstadoPago.PENDIENTE,
        EstadoPago.CONFIRMADO,
        );

        expect(resultado.estado).toBe(EstadoPago.CONFIRMADO);
    });

    it('notifica a H05 al confirmar un pedido para llevar', async () => {
      repository.buscarPorTransaccion.mockResolvedValue(pago);
      repository.actualizarEstado.mockResolvedValue({ count: 1 });
      repository.obtenerEstado.mockResolvedValue({
        ...pago,
        estado: EstadoPago.CONFIRMADO,
      });

      await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO,
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

      repository.actualizarEstado.mockResolvedValue({ count: 1 });

      repository.obtenerEstado.mockResolvedValue({
        ...pago,
        estado: EstadoPago.CONFIRMADO,
      });

      await service.cambiarEstadoTransaccion(
        transaccionId,
        EstadoTransaccionSimulada.CONFIRMADO,
      );

      expect(pedidosLlevar.confirmarPago).not.toHaveBeenCalled();
    });


    it('rechaza cambios de estado si la transacción no existe', async () => {
        repository.buscarPorTransaccion.mockResolvedValue(null);

        await expect(
        service.cambiarEstadoTransaccion(
            'inexistente',
            EstadoTransaccionSimulada.CONFIRMADO,
        ),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(repository.actualizarEstado).not.toHaveBeenCalled();
    });

    it('detecta una modificación concurrente del estado', async () => {
        repository.buscarPorTransaccion.mockResolvedValue(pago);

        // Otro proceso modificó el estado antes de actualizar
        repository.actualizarEstado.mockResolvedValue({ count: 0 });

        await expect(
        service.cambiarEstadoTransaccion(
            transaccionId,
            EstadoTransaccionSimulada.CONFIRMADO,
        ),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(repository.actualizarEstado).toHaveBeenCalledWith(
        transaccionId,
        EstadoPago.PENDIENTE,
        EstadoPago.CONFIRMADO,
        );
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
