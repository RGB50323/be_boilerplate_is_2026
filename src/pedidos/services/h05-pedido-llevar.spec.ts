import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EstadoPedido,
  Prisma,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PedidosRepository } from '../repositories/pedidos.repository.js';
import { PedidosLlevarService } from './pedidos-llevar.service.js';
import { PedidosService } from './pedidos.service.js';

// H05. Hacer un pedido para llevar (backend).
// AC2 (total en el carrito) y AC4 (mensajes del formulario) también se prueban en el
// frontend: test/h05-pedido-llevar.test.ts.

const cliente = {
  id: 'c1',
  rol: Rol.CLIENTE,
  sucursalId: null,
} as unknown as User;

const platillo = (extra: Record<string, unknown> = {}) => ({
  id: 10,
  nombre: 'Pupusa revuelta',
  activo: true,
  categoria: { activa: true },
  sucursales: [{ precio: new Prisma.Decimal('2.5'), disponibilidad: 3 }],
  ...extra,
});

describe('H05. Hacer un pedido para llevar', () => {
  const repoPedidos = { buscarPlatillos: vi.fn() };
  const repo = {
    buscarSucursal: vi.fn(),
    buscarPedido: vi.fn(),
    crear: vi.fn(),
    confirmarPago: vi.fn(),
    cancelar: vi.fn(),
  };
  let service: PedidosLlevarService;

  const dto = (extra: Record<string, unknown> = {}) => ({
    tipo: 'LLEVAR' as const,
    sucursalId: 1,
    nombreCliente: 'Ana López',
    items: [{ platilloId: 10, cantidad: 2 }],
    ...extra,
  });

  beforeEach(() => {
    [...Object.values(repo), repoPedidos.buscarPlatillos].forEach((f) =>
      f.mockReset(),
    );
    repo.buscarSucursal.mockResolvedValue({ id: 1 });
    repoPedidos.buscarPlatillos.mockResolvedValue([platillo()]);
    const pedidos = new PedidosService(
      repoPedidos as unknown as PedidosRepository,
    );
    service = new PedidosLlevarService(repo as never, pedidos);
  });

  it('AC1: solo acepta platillos habilitados de la sucursal elegida', async () => {
    repo.crear.mockResolvedValue({
      id: 5,
      estado: 'PENDIENTE_PAGO',
      total: new Prisma.Decimal(5),
    });
    await service.crear(dto(), cliente);
    expect(repoPedidos.buscarPlatillos).toHaveBeenCalledWith([10], 1);

    repoPedidos.buscarPlatillos.mockResolvedValue([
      platillo({ activo: false }),
    ]);
    await expect(service.crear(dto(), cliente)).rejects.toThrow(
      new UnprocessableEntityException(
        'El platillo "Pupusa revuelta" no está disponible.',
      ),
    );
  });

  it('AC2: calcula el total del pedido y no permite exceder la disponibilidad', async () => {
    repo.crear.mockResolvedValue({
      id: 5,
      estado: 'PENDIENTE_PAGO',
      total: new Prisma.Decimal(5),
    });
    await service.crear(dto(), cliente);
    expect(repo.crear.mock.calls[0][0].total.toNumber()).toBe(5);

    await expect(
      service.crear(dto({ items: [{ platilloId: 10, cantidad: 4 }] }), cliente),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'No hay disponibilidad suficiente de "Pupusa revuelta".',
      ),
    );
  });

  it('AC3: al registrarse el pago, el pedido queda “Recibido” con su número', async () => {
    repo.confirmarPago.mockResolvedValue({
      id: 5,
      numero: 'L1-000005',
      estado: EstadoPedido.RECIBIDO,
    });

    await expect(service.confirmarPago(5)).resolves.toEqual({
      pedidoId: 5,
      numero: 'L1-000005',
      estado: 'RECIBIDO',
    });
  });

  it('AC4: sin nombre completo indica lo que falta y no crea el pedido', async () => {
    await expect(
      service.crear(dto({ nombreCliente: undefined }), cliente),
    ).rejects.toThrow(new BadRequestException('Ingresa tu nombre completo.'));
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('AC5: al cancelar un pedido “Recibido” queda “Cancelado” y el pago “Reembolsado”', async () => {
    repo.buscarPedido.mockResolvedValue({
      id: 5,
      sucursalId: 1,
      tipo: TipoPedido.LLEVAR,
      clienteId: 'c1',
      estado: EstadoPedido.RECIBIDO,
    });

    await expect(service.cancelar(5, cliente)).resolves.toEqual({
      pedidoId: 5,
      estado: 'CANCELADO',
      pago: 'REEMBOLSADO',
    });
    expect(repo.cancelar).toHaveBeenCalledWith(5, 1);
  });

  it('AC6: no permite cancelar un pedido que ya está en preparación', async () => {
    repo.buscarPedido.mockResolvedValue({
      id: 5,
      sucursalId: 1,
      tipo: TipoPedido.LLEVAR,
      clienteId: 'c1',
      estado: EstadoPedido.EN_PREPARACION,
    });

    await expect(service.cancelar(5, cliente)).rejects.toThrow(
      new ConflictException('El pedido ya no se puede cancelar.'),
    );
    expect(repo.cancelar).not.toHaveBeenCalled();
  });
});
