import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ItemDeOtraSucursalError,
  ItemNoEncontradoError,
  ItemNoPendienteError,
  PedidoFueraDeCocinaError,
} from '@Cocina/errors';
import type { ItemMarcadoListo, PedidoCocinaRepository } from '@Cocina/repositories';
import { CocinaItemsService, type CocinaEventsService } from '@Cocina/services';
import { EstadoItem, EstadoPedido, Rol, type User } from '@PrismaClient';

const LISTO_EN = new Date('2026-11-15T18:18:30.000Z');

function marcado(overrides: Partial<ItemMarcadoListo> = {}): ItemMarcadoListo {
  return {
    itemId: 301,
    pedidoId: 41,
    listoEn: LISTO_EN,
    pedidoEstado: EstadoPedido.EN_PREPARACION,
    pedidoCompletado: false,
    ...overrides,
  };
}

const cocinero = { id: 'u-1', rol: Rol.COCINA, sucursalId: 1 } as User;

describe('CocinaItemsService', () => {
  const marcarItemListo = vi.fn();
  const platilloListo = vi.fn();
  let service: CocinaItemsService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    platilloListo.mockResolvedValue(undefined);
    service = new CocinaItemsService(
      { marcarItemListo } as unknown as PedidoCocinaRepository,
      { platilloListo } as unknown as CocinaEventsService,
    );
  });

  it('marca un ítem normal: responde LISTO, la hora local y el estado actual del pedido', async () => {
    marcarItemListo.mockResolvedValue(marcado());

    await expect(service.marcarListo(301, cocinero)).resolves.toEqual({
      itemId: 301,
      estado: EstadoItem.LISTO,
      listoEn: '12:18',
      pedidoEstado: EstadoPedido.EN_PREPARACION,
    });
    expect(marcarItemListo).toHaveBeenCalledWith(301, 1);
    expect(platilloListo).toHaveBeenCalledWith(41, false);
  });

  it('marca el último ítem: el pedido pasa a LISTO y se avisa que se completó', async () => {
    marcarItemListo.mockResolvedValue(
      marcado({ pedidoEstado: EstadoPedido.LISTO, pedidoCompletado: true }),
    );

    const respuesta = await service.marcarListo(301, cocinero);

    expect(respuesta.pedidoEstado).toBe(EstadoPedido.LISTO);
    expect(platilloListo).toHaveBeenCalledWith(41, true);
  });

  it('publica los eventos después de que la transacción terminó', async () => {
    const orden: string[] = [];
    marcarItemListo.mockImplementation(async () => {
      orden.push('commit');
      return marcado();
    });
    platilloListo.mockImplementation(async () => {
      orden.push('eventos');
    });

    await service.marcarListo(301, cocinero);

    expect(orden).toEqual(['commit', 'eventos']);
  });

  it('responde 409 si el ítem ya está listo', async () => {
    marcarItemListo.mockRejectedValue(new ItemNoPendienteError(301));

    await expect(service.marcarListo(301, cocinero)).rejects.toBeInstanceOf(ConflictException);
    expect(platilloListo).not.toHaveBeenCalled();
  });

  it('responde 409 si el pedido ya no está en cocina', async () => {
    marcarItemListo.mockRejectedValue(new PedidoFueraDeCocinaError(41));

    await expect(service.marcarListo(301, cocinero)).rejects.toBeInstanceOf(ConflictException);
  });

  it('responde 404 si el ítem no existe', async () => {
    marcarItemListo.mockRejectedValue(new ItemNoEncontradoError(999));

    await expect(service.marcarListo(999, cocinero)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 403 si el ítem es de otra sucursal', async () => {
    marcarItemListo.mockRejectedValue(new ItemDeOtraSucursalError(301));

    await expect(service.marcarListo(301, cocinero)).rejects.toBeInstanceOf(ForbiddenException);
    expect(platilloListo).not.toHaveBeenCalled();
  });

  it('responde 403 sin consultar la base si el usuario no tiene sucursal', async () => {
    await expect(
      service.marcarListo(301, { ...cocinero, sucursalId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(marcarItemListo).not.toHaveBeenCalled();
  });

  it('si falla la publicación de eventos igual responde 200: el cambio ya se confirmó', async () => {
    marcarItemListo.mockResolvedValue(marcado());
    platilloListo.mockRejectedValue(new Error('socket caído'));
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.marcarListo(301, cocinero)).resolves.toMatchObject({ itemId: 301 });
    expect(logError).toHaveBeenCalled();
  });
});
