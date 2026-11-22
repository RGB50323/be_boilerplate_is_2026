import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResenaRepository } from '../repositories/index.js';
import { ResenasService } from './resenas.service.js';

// H22. Consultar las reseñas de los platillos (backend).
// AC3 (número de página) y AC4 (mensaje sin reseñas) se prueban en el frontend:
// test/h22-consultar-resenas.test.tsx.

describe('H22. Consultar las reseñas de los platillos', () => {
  const prisma = {
    platillo: { count: vi.fn() },
    resena: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  };
  let service: ResenasService;

  beforeEach(() => {
    prisma.platillo.count.mockReset().mockResolvedValue(1);
    prisma.resena.aggregate
      .mockReset()
      .mockResolvedValue({ _avg: { estrellas: 4.25 }, _count: { _all: 23 } });
    prisma.resena.groupBy
      .mockReset()
      .mockResolvedValue([{ estrellas: 5, _count: { _all: 15 } }]);
    prisma.resena.findMany.mockReset().mockResolvedValue([
      {
        id: 1,
        estrellas: 4,
        comentario: 'Muy rica',
        creadaEn: new Date('2026-11-20T18:00:00Z'),
        cliente: { nombre: 'Ana', apellido: 'López' },
      },
    ]);
    service = new ResenasService(new ResenaRepository(prisma as never));
  });

  it('AC1: el platillo muestra su promedio con un decimal y el total de reseñas', async () => {
    const r = await service.listarPorPlatillo(7, 1);
    expect(r.promedio).toBe(4.3);
    expect(r.total).toBe(23);
  });

  it('AC2: de la más reciente a la más antigua, 10 por página, con nombre e inicial del apellido', async () => {
    const r = await service.listarPorPlatillo(7, 2);

    const consulta = prisma.resena.findMany.mock.calls[0][0];
    expect(consulta.orderBy).toEqual([{ creadaEn: 'desc' }, { id: 'desc' }]);
    expect(consulta).toMatchObject({ skip: 10, take: 10 });
    expect(r.resenas[0]).toEqual({
      id: 1,
      estrellas: 4,
      comentario: 'Muy rica',
      fecha: '2026-11-20',
      cliente: 'Ana L.',
    });
  });

  it('AC5: las reseñas ocultas o de platillos deshabilitados no se muestran ni cuentan', async () => {
    await service.listarPorPlatillo(7, 1);
    expect(prisma.resena.aggregate.mock.calls[0][0].where).toEqual({
      platilloId: 7,
      estado: 'VISIBLE',
    });
    expect(prisma.resena.findMany.mock.calls[0][0].where).toEqual({
      platilloId: 7,
      estado: 'VISIBLE',
    });

    prisma.platillo.count.mockResolvedValue(0);
    await expect(service.listarPorPlatillo(7, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
