import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EstadoPedido,
  Prisma,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import { PedidoNoCancelableError } from '../repositories/pedidos-llevar.repository.js';
import { PedidosLlevarService } from './pedidos-llevar.service.js';

const cliente = {
  id: 'c1',
  rol: Rol.CLIENTE,
  sucursalId: null,
} as unknown as User;
const mesero = { id: 'm1', rol: Rol.MESERO, sucursalId: 1 } as unknown as User;

const dto = {
  tipo: 'LLEVAR' as const,
  sucursalId: 1,
  nombreCliente: 'Ana López',
  items: [{ platilloId: 10, cantidad: 2 }],
};

const repo = {
  buscarSucursal: vi.fn(),
  buscarPedido: vi.fn(),
  buscarSeguimiento: vi.fn(),
  listarPorCliente: vi.fn(),
  crear: vi.fn(),
  confirmarPago: vi.fn(),
  cancelar: vi.fn(),
};
const pedidos = { armarItems: vi.fn(), traducir: vi.fn() };

let service: PedidosLlevarService;
beforeEach(() => {
  vi.resetAllMocks();
  pedidos.traducir.mockImplementation((e: unknown) => e);
  service = new PedidosLlevarService(repo as never, pedidos as never);
});

describe('crear (LLEVAR)', () => {
  beforeEach(() => {
    repo.buscarSucursal.mockResolvedValue({ id: 1 });
    pedidos.armarItems.mockResolvedValue([
      {
        platilloId: 10,
        cantidad: 2,
        nota: null,
        precioUnitario: new Prisma.Decimal(2.5),
      },
      {
        platilloId: 11,
        cantidad: 1,
        nota: null,
        precioUnitario: new Prisma.Decimal(3.5),
      },
    ]);
    repo.crear.mockResolvedValue({
      id: 121,
      estado: EstadoPedido.PENDIENTE_PAGO,
      total: new Prisma.Decimal(8.5),
    });
  });

  it('crea el pedido pendiente de pago con el cliente del token', async () => {
    const r = await service.crear(dto, cliente);

    expect(r).toEqual({ pedidoId: 121, estado: 'PENDIENTE_PAGO', total: 8.5 });
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        sucursalId: 1,
        clienteId: 'c1',
        nombreCliente: 'Ana López',
      }),
    );
  });

  it('403 si quien pide no es cliente', async () => {
    await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('404 si la sucursal no existe', async () => {
    repo.buscarSucursal.mockResolvedValue(null);
    await expect(service.crear(dto, cliente)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('propaga el 422 de las validaciones de platillos', async () => {
    pedidos.armarItems.mockRejectedValue(
      new UnprocessableEntityException('no disponible'),
    );
    await expect(service.crear(dto, cliente)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('traduce los errores de disponibilidad al guardar', async () => {
    repo.crear.mockRejectedValue(new Error('sin stock'));
    pedidos.traducir.mockReturnValue(new UnprocessableEntityException('stock'));
    await expect(service.crear(dto, cliente)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('confirmarPago', () => {
  it('devuelve número y estado RECIBIDO', async () => {
    repo.confirmarPago.mockResolvedValue({
      id: 121,
      numero: 'S1-000121',
      estado: EstadoPedido.RECIBIDO,
    });
    expect(await service.confirmarPago(121)).toEqual({
      pedidoId: 121,
      numero: 'S1-000121',
      estado: 'RECIBIDO',
    });
  });

  it('sigue PENDIENTE_PAGO si el pago no está confirmado', async () => {
    repo.confirmarPago.mockResolvedValue({
      id: 121,
      numero: null,
      estado: EstadoPedido.PENDIENTE_PAGO,
    });
    expect(await service.confirmarPago(121)).toMatchObject({
      numero: null,
      estado: 'PENDIENTE_PAGO',
    });
  });

  it('404 si el pedido no existe o no es para llevar', async () => {
    repo.confirmarPago.mockResolvedValue(null);
    await expect(service.confirmarPago(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('cancelar', () => {
  const pedido = {
    id: 121,
    sucursalId: 1,
    tipo: TipoPedido.LLEVAR,
    estado: EstadoPedido.RECIBIDO,
    clienteId: 'c1',
  };

  it('cancela un pedido RECIBIDO propio y reembolsa', async () => {
    repo.buscarPedido.mockResolvedValue(pedido);
    expect(await service.cancelar(121, cliente)).toEqual({
      pedidoId: 121,
      estado: 'CANCELADO',
      pago: 'REEMBOLSADO',
    });
    expect(repo.cancelar).toHaveBeenCalledWith(121, 1);
  });

  it('403 si quien cancela no es cliente', async () => {
    await expect(service.cancelar(121, mesero)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404 si el pedido no existe', async () => {
    repo.buscarPedido.mockResolvedValue(null);
    await expect(service.cancelar(121, cliente)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403 si el pedido es de otro cliente', async () => {
    repo.buscarPedido.mockResolvedValue({ ...pedido, clienteId: 'otro' });
    await expect(service.cancelar(121, cliente)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.cancelar).not.toHaveBeenCalled();
  });

  it('403 si el pedido no es para llevar', async () => {
    repo.buscarPedido.mockResolvedValue({ ...pedido, tipo: TipoPedido.MESA });
    await expect(service.cancelar(121, cliente)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    EstadoPedido.PENDIENTE_PAGO,
    EstadoPedido.EN_PREPARACION,
    EstadoPedido.LISTO,
    EstadoPedido.CANCELADO,
  ])('409 si el pedido está %s', async (estado) => {
    repo.buscarPedido.mockResolvedValue({ ...pedido, estado });
    await expect(service.cancelar(121, cliente)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.cancelar).not.toHaveBeenCalled();
  });

  it('409 si cocina lo tomó justo mientras se cancelaba', async () => {
    repo.buscarPedido.mockResolvedValue(pedido);
    repo.cancelar.mockRejectedValue(new PedidoNoCancelableError());
    await expect(service.cancelar(121, cliente)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('obtenerSeguimiento', () => {
  const pedido = {
    id: 121,
    numero: 'S1-000121',
    estado: EstadoPedido.RECIBIDO,
    tipo: TipoPedido.LLEVAR,
    clienteId: 'c1',
    nombreCliente: 'Ana López',
    total: new Prisma.Decimal(17.98),
    creadoEn: new Date('2026-11-14T18:00:00Z'),
    sucursal: { nombre: 'Centro' },
    pagos: [{ estado: 'CONFIRMADO' }],
    detalles: [
      {
        id: 1,
        platilloId: 10,
        cantidad: 2,
        precioUnitario: new Prisma.Decimal(8.99),
        nota: null,
        estado: 'PENDIENTE',
        platillo: { nombre: 'Hamburguesa' },
      },
    ],
  };

  it('devuelve el seguimiento del pedido propio', async () => {
    repo.buscarSeguimiento.mockResolvedValue(pedido);
    expect(await service.obtenerSeguimiento(121, cliente)).toEqual({
      pedidoId: 121,
      numero: 'S1-000121',
      estado: 'RECIBIDO',
      sucursal: 'Centro',
      nombreCliente: 'Ana López',
      total: 17.98,
      creadoEn: '2026-11-14T18:00:00.000Z',
      pago: 'CONFIRMADO',
      comprobanteId: null,
      items: [
        {
          itemId: 1,
          platilloId: 10,
          nombre: 'Hamburguesa',
          cantidad: 2,
          precioUnitario: 8.99,
          nota: null,
          estado: 'PENDIENTE',
        },
      ],
    });
  });

  it('pago es null si el pedido aún no tiene pagos', async () => {
    repo.buscarSeguimiento.mockResolvedValue({ ...pedido, pagos: [] });
    expect(await service.obtenerSeguimiento(121, cliente)).toMatchObject({
      pago: null,
    });
  });

  it('403 si quien consulta no es cliente', async () => {
    await expect(
      service.obtenerSeguimiento(121, mesero),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404 si el pedido no existe', async () => {
    repo.buscarSeguimiento.mockResolvedValue(null);
    await expect(
      service.obtenerSeguimiento(121, cliente),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403 si el pedido es de otro cliente o no es para llevar', async () => {
    repo.buscarSeguimiento.mockResolvedValue({ ...pedido, clienteId: 'otro' });
    await expect(
      service.obtenerSeguimiento(121, cliente),
    ).rejects.toBeInstanceOf(ForbiddenException);
    repo.buscarSeguimiento.mockResolvedValue({
      ...pedido,
      tipo: TipoPedido.MESA,
    });
    await expect(
      service.obtenerSeguimiento(121, cliente),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('listarMios', () => {
  it('pagina solo los pedidos del cliente autenticado', async () => {
    repo.listarPorCliente.mockResolvedValue([
      [
        {
          id: 121,
          numero: 'S1-000121',
          estado: EstadoPedido.RECIBIDO,
          total: new Prisma.Decimal(17.98),
          creadoEn: new Date('2026-11-14T18:00:00Z'),
          sucursal: { nombre: 'Centro' },
        },
      ],
      11,
    ]);

    expect(await service.listarMios(cliente, 2)).toEqual({
      pagina: 2,
      totalPaginas: 2,
      total: 11,
      datos: [
        {
          pedidoId: 121,
          numero: 'S1-000121',
          estado: 'RECIBIDO',
          sucursal: 'Centro',
          total: 17.98,
          creadoEn: '2026-11-14T18:00:00.000Z',
        },
      ],
    });
    expect(repo.listarPorCliente).toHaveBeenCalledWith('c1', 2, 10);
  });

  it('403 si quien consulta no es cliente', async () => {
    await expect(service.listarMios(mesero, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.listarPorCliente).not.toHaveBeenCalled();
  });
});
