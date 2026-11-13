import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoItem, EstadoPedido, Prisma, type User } from '@PrismaClient';
import type { PedidosRepository } from '../repositories/pedidos.repository.js';
import { PedidosService } from './pedidos.service.js';

const repository = {
  listarMesas: vi.fn(),
  buscarPedidosAbiertos: vi.fn(),
  buscarDetalle: vi.fn(),
};

const mesero = { id: 'u1', sucursalId: 1 } as User;
const sinSucursal = { id: 'u2', sucursalId: null } as User;

const detalle = (sucursalId = 1) => ({
  id: 120,
  numero: 'S1-000120',
  estado: EstadoPedido.ENVIADO_COCINA,
  mesaId: 4,
  sucursalId,
  total: new Prisma.Decimal(7.5),
  creadoEn: new Date('2026-10-30T18:05:00.000Z'),
  detalles: [
    {
      id: 305,
      platilloId: 12,
      cantidad: 2,
      precioUnitario: new Prisma.Decimal(3.75),
      nota: 'sin cebolla',
      estado: EstadoItem.PENDIENTE,
      platillo: { nombre: 'Hamburguesa' },
    },
  ],
});

describe('PedidosService (consultas)', () => {
  let service: PedidosService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new PedidosService(repository as unknown as PedidosRepository);
  });

  describe('listarMesas', () => {
    it('devuelve las mesas con su pedido abierto o null', async () => {
      repository.listarMesas.mockResolvedValue([
        { id: 4, numero: 4, capacidad: 4, zona: 'Terraza', activa: true },
        { id: 5, numero: 5, capacidad: 2, zona: null, activa: true },
      ]);
      repository.buscarPedidosAbiertos.mockResolvedValue([
        { id: 120, mesaId: 4 },
      ]);

      const mesas = await service.listarMesas(1, mesero);

      expect(mesas).toEqual([
        {
          id: 4,
          numero: 4,
          capacidad: 4,
          zona: 'Terraza',
          activa: true,
          pedidoAbiertoId: 120,
        },
        {
          id: 5,
          numero: 5,
          capacidad: 2,
          zona: null,
          activa: true,
          pedidoAbiertoId: null,
        },
      ]);
      expect(repository.buscarPedidosAbiertos).toHaveBeenCalledWith([4, 5]);
    });

    it('403 si la sucursal no es la del usuario', async () => {
      await expect(service.listarMesas(2, mesero)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.listarMesas).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('devuelve el pedido con sus platillos', async () => {
      repository.buscarDetalle.mockResolvedValue(detalle());

      const resultado = await service.obtener(120, mesero);

      expect(resultado).toEqual({
        pedidoId: 120,
        numero: 'S1-000120',
        estado: 'ENVIADO_COCINA',
        mesaId: 4,
        total: 7.5,
        creadoEn: '2026-10-30T18:05:00.000Z',
        items: [
          {
            itemId: 305,
            platilloId: 12,
            nombre: 'Hamburguesa',
            cantidad: 2,
            precioUnitario: 3.75,
            nota: 'sin cebolla',
            estado: 'PENDIENTE',
          },
        ],
      });
    });

    it('404 si el pedido no existe', async () => {
      repository.buscarDetalle.mockResolvedValue(null);

      await expect(service.obtener(999, mesero)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403 si el pedido es de otra sucursal', async () => {
      repository.buscarDetalle.mockResolvedValue(detalle(2));

      await expect(service.obtener(120, mesero)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('403 si el usuario no tiene sucursal', async () => {
      await expect(service.obtener(120, sinSucursal)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.buscarDetalle).not.toHaveBeenCalled();
    });
  });
});