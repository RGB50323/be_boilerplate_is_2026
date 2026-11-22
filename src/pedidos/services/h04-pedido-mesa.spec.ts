import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EstadoItem, EstadoPedido, Prisma, type User } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrearPedidoDto } from '../dto/crear-pedido.dto.js';
import type { PedidosRepository } from '../repositories/pedidos.repository.js';
import { PedidosService } from './pedidos.service.js';

// H04. Registrar el pedido de una mesa (backend).
// AC2 (total actualizado antes de confirmar) se prueba en el frontend:
// test/h04-pedido-mesa.test.ts.

const mesero = { id: 'mesero-1', sucursalId: 1 } as unknown as User;

const platillo = (disponibilidad = 40, activo = true) => ({
  id: 10,
  nombre: 'Pupusa revuelta',
  activo,
  categoria: { activa: true },
  sucursales: [{ precio: new Prisma.Decimal('3.5'), disponibilidad }],
});

describe('H04. Registrar el pedido de una mesa', () => {
  const repo = {
    buscarMesa: vi.fn(),
    buscarPlatillos: vi.fn(),
    buscarPedidoAbierto: vi.fn(),
    buscarPedido: vi.fn(),
    buscarItem: vi.fn(),
    crear: vi.fn(),
    agregarItems: vi.fn(),
    cambiarItem: vi.fn(),
  };
  let service: PedidosService;

  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    repo.buscarMesa.mockResolvedValue({ id: 7, sucursalId: 1, activa: true });
    repo.buscarPedidoAbierto.mockResolvedValue(null);
    repo.buscarPlatillos.mockResolvedValue([platillo()]);
    repo.buscarPedido.mockResolvedValue({
      id: 120,
      sucursalId: 1,
      estado: EstadoPedido.ENVIADO_COCINA,
    });
    service = new PedidosService(
      repo as unknown as PedidosRepository,
      { pedidoEnviadoACocina: vi.fn(), pedidoActualizado: vi.fn() } as never,
    );
  });

  it('AC1: al confirmar, el pedido queda “Enviado a cocina” con número único, fecha y hora', async () => {
    repo.crear.mockResolvedValue({
      id: 120,
      numero: 'S1-000120',
      estado: EstadoPedido.ENVIADO_COCINA,
      total: new Prisma.Decimal('7'),
      creadoEn: new Date('2026-11-21T18:05:00.000Z'),
    });

    const creado = await service.crear(
      {
        tipo: 'MESA',
        mesaId: 7,
        items: [{ platilloId: 10, cantidad: 2, nota: 'sin curtido' }],
      },
      mesero,
    );

    expect(creado).toEqual({
      pedidoId: 120,
      numero: 'S1-000120',
      estado: 'ENVIADO_COCINA',
      total: 7,
      creadoEn: '2026-11-21T18:05:00.000Z',
    });
    expect(repo.crear.mock.calls[0][0].items[0]).toMatchObject({
      platilloId: 10,
      cantidad: 2,
      nota: 'sin curtido',
    });
  });

  it('AC3: con un pedido abierto, solo los platillos nuevos se agregan y llegan a cocina', async () => {
    repo.agregarItems.mockResolvedValue({
      total: new Prisma.Decimal('14'),
      agregados: [
        { id: 501, platilloId: 10, cantidad: 2, estado: EstadoItem.PENDIENTE },
      ],
    });

    const r = await service.agregarItems(
      120,
      { items: [{ platilloId: 10, cantidad: 2 }] },
      mesero,
    );

    const [, , nuevos] = repo.agregarItems.mock.calls[0];
    expect(nuevos).toHaveLength(1);
    expect(r.itemsAgregados).toEqual([
      { itemId: 501, platilloId: 10, cantidad: 2, estado: 'PENDIENTE' },
    ]);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('AC4: no envía un pedido sin platillos, con cantidad menor a 1 o con un platillo agotado', async () => {
    const sinItems = await validate(
      plainToInstance(CrearPedidoDto, { tipo: 'MESA', mesaId: 7, items: [] }),
    );
    expect(sinItems.map((e) => e.property)).toContain('items');

    const cantidadCero = await validate(
      plainToInstance(CrearPedidoDto, {
        tipo: 'MESA',
        mesaId: 7,
        items: [{ platilloId: 10, cantidad: 0 }],
      }),
    );
    expect(JSON.stringify(cantidadCero)).toContain(
      'La cantidad debe ser al menos 1.',
    );

    repo.buscarPlatillos.mockResolvedValue([platillo(0)]);
    await expect(
      service.crear(
        { tipo: 'MESA', mesaId: 7, items: [{ platilloId: 10, cantidad: 1 }] },
        mesero,
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'No hay disponibilidad suficiente de "Pupusa revuelta".',
      ),
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('AC5: no permite modificar un platillo que cocina ya marcó como listo', async () => {
    repo.buscarItem.mockResolvedValue({ id: 501, estado: EstadoItem.LISTO });

    await expect(
      service.cambiarItem(120, 501, { cantidad: 3 }, mesero),
    ).rejects.toThrow(
      new ConflictException(
        'Este platillo ya está listo y no se puede modificar.',
      ),
    );
    expect(repo.cambiarItem).not.toHaveBeenCalled();
  });

  it('AC6: no registra pedidos en una mesa inexistente o de otra sucursal', async () => {
    const dto = {
      tipo: 'MESA' as const,
      mesaId: 99,
      items: [{ platilloId: 10, cantidad: 1 }],
    };

    repo.buscarMesa.mockResolvedValue(null);
    await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    repo.buscarMesa.mockResolvedValue({ id: 99, sucursalId: 2, activa: true });
    await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });
});
