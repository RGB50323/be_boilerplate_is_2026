import 'reflect-metadata';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from '@Auth/decorators';
import { RegistrarMovimientoDto } from '@Inventario/dto';
import { InsumosRepository } from '@Inventario/repositories';
import {
  Prisma,
  Rol,
  TipoMovimientoInsumo,
  UnidadInsumo,
  type User,
} from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventarioController } from '../controllers/inventario.controller.js';
import { InventarioService } from './inventario.service.js';

// H14. Controlar el inventario de insumos clave.

const gerente = { id: 'g1', rol: Rol.GERENTE, sucursalId: 1 } as User;
const D = (n: number | string) => new Prisma.Decimal(n);

const insumo = (cantidad: number, minimo: number) => ({
  id: 4,
  nombre: 'Queso',
  unidad: UnidadInsumo.LB,
  cantidad: D(cantidad),
  minimo: D(minimo),
  sucursalId: 1,
});

function conTransaccion(cantidad: string, sucursalId = 1) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        {
          sucursalId,
          cantidad,
          minimo: '5',
          nombre: 'Queso',
          unidad: 'LB',
          sucursal: 'Centro',
        },
      ]),
    insumo: { update: vi.fn() },
    movimientoInsumo: { create: vi.fn().mockResolvedValue({ id: 90 }) },
  };
  const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) };
  return { tx, repo: new InsumosRepository(prisma as never) };
}

describe('H14. Controlar el inventario de insumos clave', () => {
  const evaluador = {
    evaluar: vi.fn().mockResolvedValue(null),
    avisar: vi.fn(),
  };
  const prisma = {
    insumo: { findMany: vi.fn(), findUnique: vi.fn() },
    movimientoInsumo: { findMany: vi.fn(), count: vi.fn() },
    $transaction: (consultas: Promise<unknown>[]) => Promise.all(consultas),
  };
  let repo: InsumosRepository;
  let service: InventarioService;

  beforeEach(() => {
    [
      prisma.insumo.findMany,
      prisma.insumo.findUnique,
      prisma.movimientoInsumo.findMany,
      prisma.movimientoInsumo.count,
    ].forEach((f) => f.mockReset());
    repo = new InsumosRepository(prisma as never);
    service = new InventarioService(repo, evaluador as never);
  });

  it('AC1: cada insumo trae nombre, unidad, cantidad, mínimo e indicador Normal o Bajo', async () => {
    prisma.insumo.findMany.mockResolvedValue([insumo(10, 5), insumo(5, 5)]);

    const [normal, bajo] = await service.listar(gerente);

    expect(normal).toEqual({
      id: 4,
      nombre: 'Queso',
      unidad: 'lb',
      cantidad: 10,
      minimo: 5,
      estado: 'NORMAL',
    });
    expect(bajo.estado).toBe('BAJO');
  });

  it('AC2: el gerente registra un insumo nuevo en su sucursal', async () => {
    vi.spyOn(repo, 'crear').mockResolvedValue(insumo(0, 3) as never);

    const creado = await service.crear(gerente, {
      nombre: 'Queso',
      unidad: 'lb',
      minimo: 3,
    });

    expect(repo.crear).toHaveBeenCalledWith(1, {
      nombre: 'Queso',
      unidad: UnidadInsumo.LB,
      minimo: 3,
    });
    expect(creado).toMatchObject({ nombre: 'Queso', cantidad: 0, minimo: 3 });
  });

  it('AC3: una entrada o salida actualiza la cantidad y queda en el historial con usuario', async () => {
    const { tx, repo: r } = conTransaccion('10');
    const s = new InventarioService(r, evaluador as never);

    const mov = await s.registrarMovimiento(4, gerente, {
      tipo: TipoMovimientoInsumo.SALIDA,
      cantidad: 3,
      motivo: 'Uso del día',
    });

    expect(mov).toEqual({
      movimientoId: 90,
      cantidadAnterior: 10,
      cantidadActual: 7,
    });
    expect(tx.insumo.update.mock.calls[0][0].data.cantidad.toNumber()).toBe(7);
    expect(tx.movimientoInsumo.create.mock.calls[0][0].data).toMatchObject({
      insumoId: 4,
      tipo: 'SALIDA',
      motivo: 'Uso del día',
      usuarioId: 'g1',
    });
  });

  it('AC4: rechaza una salida mayor a la existencia y cantidades negativas o cero', async () => {
    const { tx, repo: r } = conTransaccion('2');
    await expect(
      new InventarioService(r, evaluador as never).registrarMovimiento(
        4,
        gerente,
        {
          tipo: TipoMovimientoInsumo.SALIDA,
          cantidad: 3,
          motivo: 'Uso',
        },
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'La salida supera la existencia del insumo.',
      ),
    );
    expect(tx.insumo.update).not.toHaveBeenCalled();

    for (const cantidad of [0, -1]) {
      const errores = await validate(
        plainToInstance(RegistrarMovimientoDto, {
          tipo: 'ENTRADA',
          cantidad,
          motivo: 'x',
        }),
      );
      expect(JSON.stringify(errores)).toContain(
        'La cantidad debe ser mayor a 0.',
      );
    }
  });

  it('AC5: el historial se consulta del más reciente al más antiguo', async () => {
    prisma.insumo.findUnique.mockResolvedValue({ sucursalId: 1 });
    prisma.movimientoInsumo.findMany.mockResolvedValue([]);
    prisma.movimientoInsumo.count.mockResolvedValue(0);
    vi.spyOn(repo, 'findSucursalDeInsumo').mockResolvedValue({
      sucursalId: 1,
    } as never);

    await service.historial(4, gerente, 1);

    expect(prisma.movimientoInsumo.findMany.mock.calls[0][0].orderBy).toEqual([
      { creadoEn: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('AC6: al escribir parte de un nombre filtra la lista sin importar mayúsculas', async () => {
    prisma.insumo.findMany.mockResolvedValue([]);

    await service.listar(gerente, 'que');

    expect(prisma.insumo.findMany.mock.calls[0][0].where).toMatchObject({
      sucursalId: 1,
      nombre: { contains: 'que', mode: 'insensitive' },
    });
  });

  it('AC7: solo el gerente de la sucursal registra insumos y movimientos', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, InventarioController)).toEqual([
      Rol.GERENTE,
    ]);

    const { tx, repo: r } = conTransaccion('10', 2);
    await expect(
      new InventarioService(r, evaluador as never).registrarMovimiento(
        4,
        gerente,
        {
          tipo: TipoMovimientoInsumo.ENTRADA,
          cantidad: 1,
          motivo: 'x',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.insumo.update).not.toHaveBeenCalled();
  });
});
