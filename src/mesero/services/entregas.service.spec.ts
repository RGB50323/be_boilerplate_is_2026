import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ItemDeOtraSucursalError, ItemNoEncontradoError } from '@Cocina/errors';
import type { CocinaEventsService } from '@Cocina/services';
import {
  ItemNoListoError,
  ItemYaEntregadoError,
  PedidoCanceladoError,
} from '@Mesero/errors';
import { EntregasRepository, type ItemMarcadoEntregado } from '@Mesero/repositories';
import { EntregasService } from '@Mesero/services';
import type { PrismaService } from '@Prisma/services';
import { EstadoItem, EstadoPedido, Rol, TipoPedido, type User } from '@PrismaClient';

const mesero = { id: 'm-1', rol: Rol.MESERO, sucursalId: 1 } as User;

function entregado(overrides: Partial<ItemMarcadoEntregado> = {}): ItemMarcadoEntregado {
  return {
    itemId: 301,
    pedidoId: 120,
    entregadoEn: new Date('2026-11-17T18:25:10.000Z'),
    pedidoEstado: EstadoPedido.LISTO,
    pedidoCompletado: false,
    ...overrides,
  };
}

describe('EntregasService', () => {
  const findMany = vi.fn();
  const transaction = vi.fn();
  const pedidoEntregado = vi.fn();
  let repository: EntregasRepository;
  let service: EntregasService;

  beforeEach(() => {
    vi.resetAllMocks();
    findMany.mockResolvedValue([]);
    pedidoEntregado.mockResolvedValue(undefined);
    const prisma = {
      detallePedido: { findMany },
      $transaction: transaction,
    } as unknown as PrismaService;
    repository = new EntregasRepository(prisma);
    service = new EntregasService(repository, {
      pedidoEntregado,
    } as unknown as CocinaEventsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listarItemsListos', () => {
    it('pide solo ítems LISTO de pedidos de mesa de la sucursal del mesero, por hora de listo', async () => {
      await service.listarItemsListos({ ...mesero, sucursalId: 4 });

      const { where, orderBy } = findMany.mock.calls[0][0];
      expect(where.estado).toBe(EstadoItem.LISTO);
      expect(where.pedido).toMatchObject({ sucursalId: 4, tipo: TipoPedido.MESA });
      expect(orderBy).toEqual([{ listoEn: 'asc' }, { id: 'asc' }]);
    });

    it('excluye los pedidos cancelados', async () => {
      await service.listarItemsListos(mesero);

      expect(findMany.mock.calls[0][0].where.pedido.estado).toEqual({
        not: EstadoPedido.CANCELADO,
      });
    });

    it('arma cada ítem con mesa, platillo, cantidad y la hora local de listo', async () => {
      findMany.mockResolvedValue([
        {
          id: 301,
          pedidoId: 120,
          cantidad: 3,
          listoEn: new Date('2026-11-17T18:18:00.000Z'),
          platillo: { nombre: 'Pupusa revuelta' },
          pedido: { mesa: { numero: 7 } },
        },
      ]);

      await expect(service.listarItemsListos(mesero)).resolves.toEqual([
        { itemId: 301, pedidoId: 120, mesa: 7, platillo: 'Pupusa revuelta', cantidad: 3, listoEn: '12:18' },
      ]);
    });

    it('responde 403 si el usuario no tiene sucursal', async () => {
      await expect(
        service.listarItemsListos({ ...mesero, sucursalId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('marcarEntregado', () => {
    let marcarItemEntregado: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      marcarItemEntregado = vi.spyOn(repository, 'marcarItemEntregado');
    });

    it('entrega un ítem normal: registra al mesero y responde la hora local', async () => {
      marcarItemEntregado.mockResolvedValue(entregado());

      await expect(service.marcarEntregado(301, mesero)).resolves.toEqual({
        itemId: 301,
        estado: EstadoItem.ENTREGADO,
        entregadoEn: '12:25',
        pedidoEstado: EstadoPedido.LISTO,
      });
      expect(marcarItemEntregado).toHaveBeenCalledWith(301, 1, 'm-1');
      expect(pedidoEntregado).not.toHaveBeenCalled();
    });

    it('entrega el último ítem: el pedido pasa a ENTREGADO y se publica después del commit', async () => {
      const orden: string[] = [];
      marcarItemEntregado.mockImplementation(async () => {
        orden.push('commit');
        return entregado({ pedidoEstado: EstadoPedido.ENTREGADO, pedidoCompletado: true });
      });
      pedidoEntregado.mockImplementation(async () => {
        orden.push('evento');
      });

      const respuesta = await service.marcarEntregado(301, mesero);

      expect(respuesta.pedidoEstado).toBe(EstadoPedido.ENTREGADO);
      expect(pedidoEntregado).toHaveBeenCalledWith(120);
      expect(orden).toEqual(['commit', 'evento']);
    });

    it('responde 409 si el ítem ya fue entregado', async () => {
      marcarItemEntregado.mockRejectedValue(new ItemYaEntregadoError(301));

      await expect(service.marcarEntregado(301, mesero)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 409 si el pedido está cancelado', async () => {
      marcarItemEntregado.mockRejectedValue(new PedidoCanceladoError(120));

      await expect(service.marcarEntregado(301, mesero)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 422 si el ítem todavía no está listo', async () => {
      marcarItemEntregado.mockRejectedValue(new ItemNoListoError(301));

      await expect(service.marcarEntregado(301, mesero)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('responde 404 si el ítem no existe', async () => {
      marcarItemEntregado.mockRejectedValue(new ItemNoEncontradoError(999));

      await expect(service.marcarEntregado(999, mesero)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 403 si el ítem es de otra sucursal', async () => {
      marcarItemEntregado.mockRejectedValue(new ItemDeOtraSucursalError(301));

      await expect(service.marcarEntregado(301, mesero)).rejects.toBeInstanceOf(ForbiddenException);
      expect(pedidoEntregado).not.toHaveBeenCalled();
    });

    it('responde 403 sin consultar la base si el usuario no tiene sucursal', async () => {
      await expect(
        service.marcarEntregado(301, { ...mesero, sucursalId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(marcarItemEntregado).not.toHaveBeenCalled();
    });

    it('si falla la publicación igual responde 200: la entrega ya se confirmó', async () => {
      marcarItemEntregado.mockResolvedValue(
        entregado({ pedidoEstado: EstadoPedido.ENTREGADO, pedidoCompletado: true }),
      );
      pedidoEntregado.mockRejectedValue(new Error('socket caído'));
      const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.marcarEntregado(301, mesero)).resolves.toMatchObject({
        pedidoEstado: EstadoPedido.ENTREGADO,
      });
      expect(logError).toHaveBeenCalled();
    });
  });
});
