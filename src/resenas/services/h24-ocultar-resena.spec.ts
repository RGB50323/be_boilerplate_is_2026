import 'reflect-metadata';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '@Auth/decorators';
import { EstadoResena, MotivoOcultacion, Rol, type User } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModeracionResenasController } from '../controllers/moderacion-resenas.controller.js';
import { ResenaRepository } from '../repositories/index.js';
import {
  ModeracionResenasService,
  YA_OCULTA,
} from './moderacion-resenas.service.js';

// H24. Ocultar una reseña inapropiada (backend).
// AC3 (Confirmar deshabilitado sin motivo) se prueba en el frontend:
// test/h24-ocultar-resena.test.tsx.

const gerente = { id: 'g1', rol: Rol.GERENTE, sucursalId: 1 } as User;

const fila = (extra: Record<string, unknown> = {}) => ({
  id: 28,
  platillo: { nombre: 'Hamburguesa' },
  estrellas: 1,
  comentario: 'Texto ofensivo',
  creadaEn: new Date('2026-11-17T18:00:00Z'),
  cliente: { nombre: 'Ana', apellido: 'López' },
  estado: EstadoResena.VISIBLE,
  ocultaEn: null,
  ocultaPor: null,
  motivoOcultacion: null,
  pedido: { sucursalId: 1 },
  ...extra,
});

describe('H24. Ocultar una reseña inapropiada', () => {
  const prisma = {
    $transaction: (consultas: Promise<unknown>[]) => Promise.all(consultas),
    resena: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
  };
  let service: ModeracionResenasService;

  beforeEach(() => {
    Object.values(prisma.resena).forEach((f) => f.mockReset());
    prisma.resena.count.mockResolvedValue(1);
    prisma.resena.findMany.mockResolvedValue([fila()]);
    prisma.resena.findUnique.mockResolvedValue(fila());
    prisma.resena.updateMany.mockResolvedValue({ count: 1 });
    service = new ModeracionResenasService(
      new ResenaRepository(prisma as never),
    );
  });

  it('AC1: lista las reseñas de mi sucursal de la más reciente a la más antigua, 10 por página, con filtro', async () => {
    const r = await service.listar(gerente, {
      pagina: 1,
      estado: EstadoResena.OCULTA,
    });

    const consulta = prisma.resena.findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({
      pedido: { sucursalId: 1 },
      estado: 'OCULTA',
    });
    expect(consulta.orderBy).toEqual([{ creadaEn: 'desc' }, { id: 'desc' }]);
    expect(consulta.take).toBe(10);
    expect(r.datos[0]).toMatchObject({
      platillo: 'Hamburguesa',
      estrellas: 1,
      comentario: 'Texto ofensivo',
      fecha: '2026-11-17',
      estado: 'VISIBLE',
    });
  });

  it('AC2: ocultar una reseña visible con motivo la pasa a OCULTA y deja de contar en el promedio', async () => {
    await service.ocultar(gerente, 28, MotivoOcultacion.OFENSIVO);

    expect(prisma.resena.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 28, estado: EstadoResena.VISIBLE },
      data: {
        estado: EstadoResena.OCULTA,
        ocultaPorId: 'g1',
        motivoOcultacion: 'OFENSIVO',
      },
    });
    prisma.resena.aggregate.mockResolvedValue({});
    await new ResenaRepository(prisma as never).resumen(10);
    expect(prisma.resena.aggregate.mock.calls[0][0].where.estado).toBe(
      EstadoResena.VISIBLE,
    );
  });

  it('AC4: una reseña que ya está oculta no se oculta otra vez', async () => {
    prisma.resena.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.ocultar(gerente, 28, MotivoOcultacion.SPAM),
    ).rejects.toThrow(new ConflictException(YA_OCULTA));
    expect(YA_OCULTA).toBe('Esta reseña ya estaba oculta.');
  });

  it('AC5: el detalle de una reseña oculta dice quién la ocultó, fecha, hora y motivo', async () => {
    prisma.resena.findUnique.mockResolvedValue(
      fila({
        estado: EstadoResena.OCULTA,
        ocultaEn: new Date('2026-11-10T05:25:00Z'),
        ocultaPor: {
          nombre: 'Gabriel',
          apellido: 'Gerente',
          email: 'g@example.com',
        },
        motivoOcultacion: MotivoOcultacion.OFENSIVO,
      }),
    );

    const r = await service.ocultar(gerente, 28, MotivoOcultacion.OFENSIVO);
    expect(r.ocultacion).toEqual({
      por: 'Gabriel Gerente',
      fecha: '2026-11-09',
      hora: '23:25',
      motivo: 'OFENSIVO',
    });
  });

  it('AC6: otro rol, o una reseña de otra sucursal, no se puede ver ni ocultar', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, ModeracionResenasController)).toEqual(
      [Rol.GERENTE],
    );

    prisma.resena.findUnique.mockResolvedValue(
      fila({ pedido: { sucursalId: 2 } }),
    );
    await expect(
      service.ocultar(gerente, 28, MotivoOcultacion.SPAM),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.resena.updateMany).not.toHaveBeenCalled();
  });
});
