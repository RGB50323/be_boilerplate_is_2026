import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EstadoItem, EstadoPedido, Prisma, type User } from '@PrismaClient';
import {
  DisponibilidadInsuficienteError,
  ItemNoModificableError,
  PedidoSinItemsError,
  type PedidosRepository,
} from '../repositories/pedidos.repository.js';
import { PedidosService } from './pedidos.service.js';

const repository = {
  buscarMesa: vi.fn(),
  buscarPlatillos: vi.fn(),
  buscarPedidoAbierto: vi.fn(),
  crear: vi.fn(),
  buscarPedido: vi.fn(),
  buscarItem: vi.fn(),
  agregarItems: vi.fn(),
  cambiarItem: vi.fn(),
  quitarItem: vi.fn(),
};

const mesero = { id: 'u1', sucursalId: 1 } as User;
const sinSucursal = { id: 'u2', sucursalId: null } as User;

const pedidoAbierto = (estado: EstadoPedido = EstadoPedido.ENVIADO_COCINA) => ({
  id: 120,
  sucursalId: 1,
  estado,
});

const item = (estado: EstadoItem = EstadoItem.PENDIENTE) => ({
  id: 305,
  platilloId: 12,
  cantidad: 2,
  estado,
});

const platillo = (activo = true, disponibilidad = 10) => ({
  id: 12,
  nombre: 'Hamburguesa',
  activo,
  categoria: { activa: true },
  sucursales: [{ precio: new Prisma.Decimal(3.75), disponibilidad }],
});

const dtoAgregar = {
  items: [{ platilloId: 12, cantidad: 2, nota: 'sin cebolla' }],
};

describe('PedidosService (items)', () => {
  let service: PedidosService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new PedidosService(repository as unknown as PedidosRepository);
  });

  describe('agregarItems', () => {
    it('agrega los platillos y devuelve el total nuevo', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarPlatillos.mockResolvedValue([platillo()]);
      repository.agregarItems.mockResolvedValue({
        total: new Prisma.Decimal(7.5),
        agregados: [
          { id: 400, platilloId: 12, cantidad: 2, estado: EstadoItem.PENDIENTE },
        ],
      });

      const resultado = await service.agregarItems(120, dtoAgregar, mesero);

      expect(resultado).toEqual({
        pedidoId: 120,
        total: 7.5,
        itemsAgregados: [
          { itemId: 400, platilloId: 12, cantidad: 2, estado: 'PENDIENTE' },
        ],
      });
      expect(repository.agregarItems).toHaveBeenCalledWith(120, 1, [
        expect.objectContaining({
          platilloId: 12,
          cantidad: 2,
          nota: 'sin cebolla',
        }),
      ]);
    });

    it('404 si el pedido no existe', async () => {
      repository.buscarPedido.mockResolvedValue(null);

      await expect(
        service.agregarItems(999, dtoAgregar, mesero),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 si el pedido es de otra sucursal', async () => {
      repository.buscarPedido.mockResolvedValue({
        id: 120,
        sucursalId: 2,
        estado: EstadoPedido.ENVIADO_COCINA,
      });

      await expect(
        service.agregarItems(120, dtoAgregar, mesero),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('403 si el usuario no tiene sucursal', async () => {
      await expect(
        service.agregarItems(120, dtoAgregar, sinSucursal),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.buscarPedido).not.toHaveBeenCalled();
    });

    it('409 si el pedido está cerrado', async () => {
      repository.buscarPedido.mockResolvedValue(
        pedidoAbierto(EstadoPedido.ENTREGADO),
      );

      await expect(
        service.agregarItems(120, dtoAgregar, mesero),
      ).rejects.toThrow('El pedido ya está cerrado.');
    });

    it('404 si un platillo no existe', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarPlatillos.mockResolvedValue([]);

      await expect(
        service.agregarItems(120, dtoAgregar, mesero),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('422 si el platillo está deshabilitado', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarPlatillos.mockResolvedValue([platillo(false)]);

      await expect(
        service.agregarItems(120, dtoAgregar, mesero),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.agregarItems).not.toHaveBeenCalled();
    });

    it('422 si la cantidad supera la disponibilidad', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarPlatillos.mockResolvedValue([platillo(true, 1)]);

      await expect(
        service.agregarItems(120, dtoAgregar, mesero),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.agregarItems).not.toHaveBeenCalled();
    });

    it('traduce la carrera de disponibilidad a 422', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarPlatillos.mockResolvedValue([platillo()]);
      repository.agregarItems.mockRejectedValue(
        new DisponibilidadInsuficienteError(12),
      );

      await expect(
        service.agregarItems(120, dtoAgregar, mesero),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('cambiarItem', () => {
    it('400 si no se indica cantidad ni nota', async () => {
      await expect(service.cambiarItem(120, 305, {}, mesero)).rejects.toThrow(
        'Indica la cantidad o la nota a cambiar.',
      );
      expect(repository.buscarPedido).not.toHaveBeenCalled();
    });

    it('cambia la cantidad y devuelve el total', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item());
      repository.cambiarItem.mockResolvedValue(new Prisma.Decimal(11.25));

      const resultado = await service.cambiarItem(
        120,
        305,
        { cantidad: 3 },
        mesero,
      );

      expect(resultado).toEqual({ pedidoId: 120, total: 11.25 });
      expect(repository.cambiarItem).toHaveBeenCalledWith(
        120,
        1,
        item(),
        { cantidad: 3, nota: undefined },
      );
    });

    it('guarda null cuando la nota llega vacía', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item());
      repository.cambiarItem.mockResolvedValue(new Prisma.Decimal(7.5));

      await service.cambiarItem(120, 305, { nota: '' }, mesero);

      expect(repository.cambiarItem).toHaveBeenCalledWith(
        120,
        1,
        item(),
        { cantidad: undefined, nota: null },
      );
    });

    it('404 si el platillo del pedido no existe', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(null);

      await expect(
        service.cambiarItem(120, 999, { cantidad: 2 }, mesero),
      ).rejects.toThrow('El platillo del pedido no existe.');
    });

    it('409 si el platillo ya está listo', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item(EstadoItem.LISTO));

      await expect(
        service.cambiarItem(120, 305, { cantidad: 2 }, mesero),
      ).rejects.toThrow('Este platillo ya está listo y no se puede modificar.');
      expect(repository.cambiarItem).not.toHaveBeenCalled();
    });

    it('409 si el ítem pasó a listo durante la operación', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item());
      repository.cambiarItem.mockRejectedValue(new ItemNoModificableError());

      await expect(
        service.cambiarItem(120, 305, { cantidad: 2 }, mesero),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('422 si no alcanza la disponibilidad', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item());
      repository.cambiarItem.mockRejectedValue(
        new DisponibilidadInsuficienteError(12),
      );

      await expect(
        service.cambiarItem(120, 305, { cantidad: 99 }, mesero),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('quitarItem', () => {
    it('quita el platillo y devuelve el total', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item());
      repository.quitarItem.mockResolvedValue(new Prisma.Decimal(3.75));

      const resultado = await service.quitarItem(120, 305, mesero);

      expect(resultado).toEqual({ pedidoId: 120, total: 3.75 });
      expect(repository.quitarItem).toHaveBeenCalledWith(120, 1, item());
    });

    it('409 si el pedido está cerrado', async () => {
      repository.buscarPedido.mockResolvedValue(
        pedidoAbierto(EstadoPedido.CANCELADO),
      );

      await expect(
        service.quitarItem(120, 305, mesero),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 si el platillo del pedido no existe', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(null);

      await expect(
        service.quitarItem(120, 999, mesero),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 si el platillo ya está listo', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item(EstadoItem.ENTREGADO));

      await expect(
        service.quitarItem(120, 305, mesero),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.quitarItem).not.toHaveBeenCalled();
    });

    it('409 si el pedido quedaría sin platillos', async () => {
      repository.buscarPedido.mockResolvedValue(pedidoAbierto());
      repository.buscarItem.mockResolvedValue(item());
      repository.quitarItem.mockRejectedValue(new PedidoSinItemsError());

      await expect(service.quitarItem(120, 305, mesero)).rejects.toThrow(
        'El pedido debe conservar al menos un platillo.',
      );
    });
  });
});