import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
import { EntregasService } from './entregas.service.js';

// H08. Entrega de platillos a la mesa (backend).
// La agrupación por mesa en pantalla está en el frontend (lib/entregas.ts:
// agruparPorMesa) y se revisa en la prueba de sistema.

const mesero = { id: 'mesero-1', rol: Rol.MESERO, sucursalId: 1 } as User;

function transaccion(estadoItem: EstadoItem, porEntregar: number) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        {
          pedidoId: 120,
          sucursalId: 1,
          estadoItem,
          estadoPedido: EstadoPedido.LISTO,
        },
      ]),
    detallePedido: {
      update: vi
        .fn()
        .mockResolvedValue({ entregadoEn: new Date('2026-11-21T18:30:00Z') }),
      count: vi.fn().mockResolvedValue(porEntregar),
    },
    pedido: { update: vi.fn() },
  };
  const prisma = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  } as unknown as PrismaService;
  return { tx, repo: new EntregasRepository(prisma) };
}

describe('H08. Entrega de platillos a la mesa', () => {
  const eventos = { pedidoEntregado: vi.fn() };

  beforeEach(() => eventos.pedidoEntregado.mockReset());

  it('AC1: lista solo platillos listos de mesas de mi sucursal, con su mesa', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 501,
        pedidoId: 120,
        cantidad: 2,
        listoEn: new Date('2026-11-21T18:10:00Z'),
        platillo: { nombre: 'Pupusa revuelta' },
        pedido: { mesa: { numero: 3 } },
      },
    ]);
    const repo = new EntregasRepository({
      detallePedido: { findMany },
    } as never);

    const lista = await new EntregasService(
      repo,
      eventos as never,
    ).listarItemsListos(mesero);

    expect(findMany.mock.calls[0][0].where).toEqual({
      estado: EstadoItem.LISTO,
      pedido: {
        sucursalId: 1,
        tipo: TipoPedido.MESA,
        estado: { not: EstadoPedido.CANCELADO },
      },
    });
    expect(lista[0]).toMatchObject({
      itemId: 501,
      mesa: 3,
      platillo: 'Pupusa revuelta',
      cantidad: 2,
    });
  });

  it('AC2: al marcarlo entregado se registra quién lo entregó y cuándo', async () => {
    const { tx, repo } = transaccion(EstadoItem.LISTO, 1);

    const r = await new EntregasService(repo, eventos as never).marcarEntregado(
      501,
      mesero,
    );

    const { data } = tx.detallePedido.update.mock.calls[0][0];
    expect(data).toMatchObject({
      estado: EstadoItem.ENTREGADO,
      entregadoPorId: 'mesero-1',
    });
    expect(data.entregadoEn).toBeInstanceOf(Date);
    expect(r.estado).toBe('ENTREGADO');
  });

  it('AC3: al entregar el último platillo, el pedido pasa a Entregado', async () => {
    const { tx, repo } = transaccion(EstadoItem.LISTO, 0);

    const r = await new EntregasService(repo, eventos as never).marcarEntregado(
      501,
      mesero,
    );

    expect(tx.pedido.update).toHaveBeenCalledWith({
      where: { id: 120 },
      data: { estado: EstadoPedido.ENTREGADO },
    });
    expect(r.pedidoEstado).toBe(EstadoPedido.ENTREGADO);
    expect(eventos.pedidoEntregado).toHaveBeenCalledWith(120);
  });

  it('AC4: no permite entregar un platillo que no está listo o que ya fue entregado', async () => {
    const pendiente = transaccion(EstadoItem.PENDIENTE, 1);
    await expect(
      new EntregasService(pendiente.repo, eventos as never).marcarEntregado(
        501,
        mesero,
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException('Este platillo todavía no está listo.'),
    );

    const entregado = transaccion(EstadoItem.ENTREGADO, 0);
    await expect(
      new EntregasService(entregado.repo, eventos as never).marcarEntregado(
        501,
        mesero,
      ),
    ).rejects.toThrow(new ConflictException('Este platillo ya fue entregado.'));
    expect(pendiente.tx.detallePedido.update).not.toHaveBeenCalled();
    expect(entregado.tx.detallePedido.update).not.toHaveBeenCalled();
  });
});
