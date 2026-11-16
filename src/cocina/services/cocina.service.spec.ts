import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CocinaService } from '@Cocina/services';
import { PedidoCocinaRepository, type PedidoCocina } from '@Cocina/repositories';
import type { PrismaService } from '@Prisma/services';
import {
  EstadoItem,
  EstadoPago,
  EstadoPedido,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import type { EnvConfig } from '@Config';

const AHORA = new Date('2026-11-06T18:00:00.000Z');

function minutosAntes(minutos: number): Date {
  return new Date(AHORA.getTime() - minutos * 60_000);
}

function pedido(overrides: Partial<PedidoCocina> = {}): PedidoCocina {
  return {
    id: 1,
    numero: 'C-0001',
    tipo: TipoPedido.MESA,
    estado: EstadoPedido.ENVIADO_COCINA,
    sucursalId: 1,
    mesaId: 10,
    clienteId: null,
    nombreCliente: null,
    subtotal: 0,
    descuentos: 0,
    impuestos: 0,
    propina: 0,
    total: 0,
    creadoEn: minutosAntes(5),
    actualizadoEn: AHORA,
    mesa: { numero: 3 },
    detalles: [
      {
        id: 100,
        pedidoId: 1,
        platilloId: 7,
        cantidad: 2,
        precioUnitario: 0,
        nota: 'Sin cebolla',
        estado: EstadoItem.PENDIENTE,
        listoEn: null,
        entregadoEn: null,
        entregadoPorId: null,
        platillo: { nombre: 'Hamburguesa' },
      },
    ],
    pagos: [],
    ...overrides,
  } as unknown as PedidoCocina;
}

function usuario(overrides: Partial<User> = {}): User {
  return { id: 'u-1', rol: Rol.COCINA, sucursalId: 1, ...overrides } as User;
}

describe('CocinaService', () => {
  const findMany = vi.fn();
  let service: CocinaService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    findMany.mockReset().mockResolvedValue([]);

    const prisma = { pedido: { findMany } } as unknown as PrismaService;
    const config = {
      get: () => 15,
    } as unknown as ConfigService<EnvConfig, true>;
    service = new CocinaService(new PedidoCocinaRepository(prisma), config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('listarPendientes', () => {
    it('filtra por la sucursal del usuario y ordena del más antiguo al más reciente', async () => {
      await service.listarPendientes(usuario({ sucursalId: 4 }));

      const args = findMany.mock.calls[0][0];
      expect(args.where.sucursalId).toBe(4);
      expect(args.orderBy).toEqual([{ creadoEn: 'asc' }, { id: 'asc' }]);
    });

    it('conserva el orden de llegada que devuelve la base', async () => {
      findMany.mockResolvedValue([
        pedido({ id: 1, creadoEn: minutosAntes(20) }),
        pedido({ id: 2, creadoEn: minutosAntes(3) }),
      ]);

      const result = await service.listarPendientes(usuario());

      expect(result.map((p) => p.id)).toEqual([1, 2]);
    });

    it('solo pide pedidos en RECIBIDO, ENVIADO_COCINA o EN_PREPARACION, así PENDIENTE_PAGO queda fuera', async () => {
      await service.listarPendientes(usuario());

      const { estado } = findMany.mock.calls[0][0].where;
      expect(estado.in).toEqual([
        EstadoPedido.RECIBIDO,
        EstadoPedido.ENVIADO_COCINA,
        EstadoPedido.EN_PREPARACION,
      ]);
      expect(estado.in).not.toContain(EstadoPedido.PENDIENTE_PAGO);
    });

    it('exige pago confirmado a los pedidos para llevar', async () => {
      await service.listarPendientes(usuario());

      expect(findMany.mock.calls[0][0].where.OR).toEqual([
        { tipo: TipoPedido.MESA },
        { pagos: { some: { estado: EstadoPago.CONFIRMADO } } },
      ]);
    });

    it('solo pide pedidos con al menos un ítem PENDIENTE', async () => {
      await service.listarPendientes(usuario());

      expect(findMany.mock.calls[0][0].where.detalles).toEqual({
        some: { estado: EstadoItem.PENDIENTE },
      });
    });

    it('responde 403 si el usuario no tiene sucursal', async () => {
      await expect(service.listarPendientes(usuario({ sucursalId: null }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('esVisibleEnCocina', () => {
    it('excluye un pedido para llevar en PENDIENTE_PAGO', () => {
      const llevarSinPagar = pedido({
        tipo: TipoPedido.LLEVAR,
        estado: EstadoPedido.PENDIENTE_PAGO,
        mesa: null,
      });
      expect(service.esVisibleEnCocina(llevarSinPagar)).toBe(false);
    });

    it('excluye un pedido con todos sus ítems LISTO', () => {
      const base = pedido();
      const todoListo = pedido({
        detalles: base.detalles.map((d) => ({ ...d, estado: EstadoItem.LISTO })),
      });
      expect(service.esVisibleEnCocina(todoListo)).toBe(false);
    });

    it('excluye un pedido cancelado aunque tenga ítems pendientes', () => {
      expect(service.esVisibleEnCocina(pedido({ estado: EstadoPedido.CANCELADO }))).toBe(false);
    });

    it('excluye un pedido para llevar sin pago confirmado', () => {
      const llevar = pedido({
        tipo: TipoPedido.LLEVAR,
        estado: EstadoPedido.RECIBIDO,
        mesa: null,
        pagos: [{ estado: EstadoPago.PENDIENTE }],
      });
      expect(service.esVisibleEnCocina(llevar)).toBe(false);
    });

    it('incluye un pedido para llevar RECIBIDO con pago confirmado', () => {
      const llevar = pedido({
        tipo: TipoPedido.LLEVAR,
        estado: EstadoPedido.RECIBIDO,
        mesa: null,
        pagos: [{ estado: EstadoPago.CONFIRMADO }],
      });
      expect(service.esVisibleEnCocina(llevar)).toBe(true);
    });

    it('incluye un pedido en preparación con un ítem pendiente', () => {
      expect(service.esVisibleEnCocina(pedido({ estado: EstadoPedido.EN_PREPARACION }))).toBe(true);
    });
  });

  describe('toDto', () => {
    it('marca como retrasado solo lo que supera el umbral', () => {
      expect(service.toDto(pedido({ creadoEn: minutosAntes(15) }))).toMatchObject({
        minutosEspera: 15,
        retrasado: false,
      });
      expect(service.toDto(pedido({ creadoEn: minutosAntes(16) }))).toMatchObject({
        minutosEspera: 16,
        retrasado: true,
      });
    });

    it('arma el destino "Mesa N" para pedidos de mesa', () => {
      expect(service.toDto(pedido())).toMatchObject({
        tipo: TipoPedido.MESA,
        destino: 'Mesa 3',
        mesaNumero: 3,
      });
    });

    it('arma el destino "Para llevar" para pedidos para llevar', () => {
      const llevar = pedido({ tipo: TipoPedido.LLEVAR, mesaId: null, mesa: null });
      expect(service.toDto(llevar)).toMatchObject({
        tipo: TipoPedido.LLEVAR,
        destino: 'Para llevar',
        mesaNumero: null,
      });
    });

    it('expone creadoEn en ISO 8601 y los ítems con platillo, cantidad y nota', () => {
      expect(service.toDto(pedido())).toMatchObject({
        creadoEn: minutosAntes(5).toISOString(),
        items: [
          { id: 100, platillo: 'Hamburguesa', cantidad: 2, nota: 'Sin cebolla', estado: 'PENDIENTE' },
        ],
      });
    });
  });
});
