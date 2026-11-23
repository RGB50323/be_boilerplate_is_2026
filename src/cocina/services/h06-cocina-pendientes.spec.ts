import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { CocinaEvento } from '@Cocina/events';
import { CocinaGateway } from '@Cocina/gateways';
import {
  PedidoCocinaRepository,
  type PedidoCocina,
} from '@Cocina/repositories';
import type { EnvConfig } from '@Config';
import type { PrismaService } from '@Prisma/services';
import {
  EstadoItem,
  EstadoPago,
  EstadoPedido,
  Rol,
  TipoPedido,
  type User,
} from '@PrismaClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CocinaEventsService } from './cocina-events.service.js';
import { CocinaService } from './cocina.service.js';

// H06. Ver los pedidos pendientes en cocina.

const AHORA = new Date('2026-11-21T18:00:00.000Z');
const minutosAntes = (m: number) => new Date(AHORA.getTime() - m * 60_000);

function pedido(extra: Partial<PedidoCocina> = {}): PedidoCocina {
  return {
    id: 1,
    numero: 'S1-000001',
    tipo: TipoPedido.MESA,
    estado: EstadoPedido.ENVIADO_COCINA,
    sucursalId: 1,
    creadoEn: minutosAntes(5),
    mesa: { numero: 3 },
    detalles: [
      {
        id: 100,
        cantidad: 2,
        nota: 'Sin cebolla',
        estado: EstadoItem.PENDIENTE,
        listoEn: null,
        platillo: { nombre: 'Hamburguesa' },
      },
    ],
    pagos: [],
    ...extra,
  } as unknown as PedidoCocina;
}

const cocinero = { id: 'u1', rol: Rol.COCINA, sucursalId: 1 } as User;

describe('H06. Ver los pedidos pendientes en cocina', () => {
  const findMany = vi.fn();
  let repo: PedidoCocinaRepository;
  let service: CocinaService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    findMany.mockReset().mockResolvedValue([]);
    repo = new PedidoCocinaRepository({
      pedido: { findMany },
    } as unknown as PrismaService);
    const config = { get: () => 15 } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    service = new CocinaService(repo, config);
  });

  afterEach(() => vi.useRealTimers());

  it('AC1: lista del más antiguo al más reciente con número, destino, hora, platillos, cantidades y notas', async () => {
    findMany.mockResolvedValue([
      pedido(),
      pedido({
        id: 2,
        numero: 'L1-000002',
        tipo: TipoPedido.LLEVAR,
        mesa: null,
      } as never),
    ]);

    const lista = await service.listarPendientes(cocinero);

    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { creadoEn: 'asc' },
      { id: 'asc' },
    ]);
    expect(lista[0]).toMatchObject({ numero: 'S1-000001', destino: 'Mesa 3' });
    expect(lista[1]).toMatchObject({
      numero: 'L1-000002',
      destino: 'Para llevar',
    });
    expect(JSON.stringify(lista[0])).toContain('Sin cebolla');
    expect(JSON.stringify(lista[0])).toContain('Hamburguesa');
  });

  it('AC2: un pedido nuevo se publica de inmediato a la sala de su sucursal', async () => {
    const emitter = { emit: vi.fn() } as unknown as EventEmitter2;
    vi.spyOn(repo, 'findById').mockResolvedValue(pedido());
    await new CocinaEventsService(repo, service, emitter).pedidoEnviadoACocina(
      1,
    );

    const [evento, datos] = (emitter.emit as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(evento).toBe(CocinaEvento.PEDIDO_NUEVO);
    expect(datos.sucursalId).toBe(1);

    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new CocinaGateway({} as never);
    Object.assign(gateway, { server: { to } });
    gateway.emitirPedidoNuevo(datos);
    expect(to).toHaveBeenCalledWith('sucursal:1');
    expect(emit).toHaveBeenCalledWith('pedido:nuevo', datos.pedido);
  });

  it('AC3: solo consulta pedidos con algún platillo pendiente', async () => {
    await service.listarPendientes(cocinero);
    expect(findMany.mock.calls[0][0].where.detalles).toEqual({
      some: { estado: EstadoItem.PENDIENTE },
    });
    const todoListo = pedido({
      detalles: [{ ...pedido().detalles[0], estado: EstadoItem.LISTO }],
    } as never);
    expect(service.esVisibleEnCocina(todoListo)).toBe(false);
  });

  it('AC4: un pedido con más de 15 minutos de espera aparece como retrasado', async () => {
    findMany.mockResolvedValue([
      pedido({ creadoEn: minutosAntes(16) }),
      pedido({ id: 2, creadoEn: minutosAntes(10) }),
    ]);

    const [viejo, nuevo] = await service.listarPendientes(cocinero);
    expect(viejo.retrasado).toBe(true);
    expect(nuevo.retrasado).toBe(false);
  });

  it('AC5: un pedido para llevar sin pago confirmado no aparece', async () => {
    await service.listarPendientes(cocinero);
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { tipo: TipoPedido.MESA },
      { pagos: { some: { estado: EstadoPago.CONFIRMADO } } },
    ]);
    const sinPago = pedido({
      tipo: TipoPedido.LLEVAR,
      pagos: [{ estado: EstadoPago.PENDIENTE }],
    } as never);
    expect(service.esVisibleEnCocina(sinPago)).toBe(false);
  });

  it('AC6: cocina solo consulta su sucursal y sin sucursal no ve nada', async () => {
    await service.listarPendientes({ ...cocinero, sucursalId: 2 });
    expect(findMany.mock.calls[0][0].where.sucursalId).toBe(2);

    await expect(
      service.listarPendientes({ ...cocinero, sucursalId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
