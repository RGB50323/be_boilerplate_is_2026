import { ConflictException } from '@nestjs/common';
import { ItemNoPendienteError } from '@Cocina/errors';
import { PedidoCocinaRepository } from '@Cocina/repositories';
import { EntregasRepository } from '@Mesero/repositories';
import type { PrismaService } from '@Prisma/services';
import {
  EstadoItem,
  EstadoPedido,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CocinaItemsService } from './cocina-items.service.js';

// H07. Marcar un platillo como listo.

const cocinero = { id: 'u1', rol: Rol.COCINA, sucursalId: 1 } as User;
const LISTO_EN = new Date('2026-11-21T18:10:00.000Z');

function transaccion(fila: Record<string, unknown>, pendientes: number) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([fila]),
    detallePedido: {
      update: vi.fn().mockResolvedValue({ listoEn: LISTO_EN }),
      count: vi.fn().mockResolvedValue(pendientes),
    },
    pedido: {
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return { tx, repo: new PedidoCocinaRepository(prisma) };
}

const fila = {
  pedidoId: 120,
  sucursalId: 1,
  estadoItem: EstadoItem.PENDIENTE,
  estadoPedido: EstadoPedido.ENVIADO_COCINA,
  tipo: TipoPedido.MESA,
};

describe('H07. Marcar un platillo como listo', () => {
  const eventos = { platilloListo: vi.fn() };

  beforeEach(() => eventos.platilloListo.mockReset());

  it('AC1: el platillo pendiente pasa a “Listo” y se registra la hora', async () => {
    const { tx, repo } = transaccion(fila, 1);

    const r = await new CocinaItemsService(repo, eventos as never).marcarListo(
      501,
      cocinero,
    );

    const { data } = tx.detallePedido.update.mock.calls[0][0];
    expect(data.estado).toBe(EstadoItem.LISTO);
    expect(data.listoEn).toBeInstanceOf(Date);
    expect(r).toMatchObject({ itemId: 501, estado: 'LISTO' });
    expect(r.listoEn).toMatch(/\d{1,2}:\d{2}/);
  });

  it('AC2: con el último platillo pendiente, el pedido pasa a “Listo” y sale de pendientes', async () => {
    const { tx, repo } = transaccion(fila, 0);

    const r = await new CocinaItemsService(repo, eventos as never).marcarListo(
      501,
      cocinero,
    );

    expect(tx.pedido.update).toHaveBeenCalledWith({
      where: { id: 120 },
      data: { estado: EstadoPedido.LISTO },
    });
    expect(r.pedidoEstado).toBe(EstadoPedido.LISTO);
    expect(eventos.platilloListo).toHaveBeenCalledWith(120, true);
  });

  it('AC3: un platillo que ya está listo no se puede marcar de nuevo', async () => {
    const { tx, repo } = transaccion(
      { ...fila, estadoItem: EstadoItem.LISTO },
      0,
    );

    await expect(repo.marcarItemListo(501, 1)).rejects.toBeInstanceOf(
      ItemNoPendienteError,
    );
    await expect(
      new CocinaItemsService(repo, eventos as never).marcarListo(501, cocinero),
    ).rejects.toThrow(new ConflictException('Este platillo ya está listo.'));
    expect(tx.detallePedido.update).not.toHaveBeenCalled();
  });

  it('AC4: el mesero ve como listos para entregar los platillos marcados', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new EntregasRepository({
      detallePedido: { findMany },
    } as never).findItemsListos(1);

    expect(findMany.mock.calls[0][0].where).toMatchObject({
      estado: EstadoItem.LISTO,
      pedido: { sucursalId: 1, tipo: TipoPedido.MESA },
    });
  });
});
