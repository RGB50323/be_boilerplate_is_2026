import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '@Auth/decorators';
import { Rol } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReporteResenasController } from '../controllers/reporte-resenas.controller.js';
import { ResenaRepository } from '../repositories/index.js';
import {
  ReporteResenasService,
  SIN_PERMISO_REPORTE,
} from './reporte-resenas.service.js';

// H23. Promedio de calificación de mi sucursal (backend).
// Los mensajes en pantalla se prueban en el frontend: test/h23-reporte-calificaciones.test.tsx.

describe('H23. Promedio de calificación de mi sucursal', () => {
  const prisma = {
    sucursal: { findUnique: vi.fn() },
    resena: { groupBy: vi.fn() },
  };
  let service: ReporteResenasService;

  beforeEach(() => {
    prisma.sucursal.findUnique
      .mockReset()
      .mockResolvedValue({ nombre: 'Centro' });
    prisma.resena.groupBy.mockReset().mockResolvedValue([
      { estrellas: 5, _count: { _all: 4 } },
      { estrellas: 4, _count: { _all: 1 } },
      { estrellas: 2, _count: { _all: 1 } },
    ]);
    service = new ReporteResenasService(new ResenaRepository(prisma as never));
  });

  it('AC1: da el promedio con un decimal, el total y la cantidad de reseñas de 1 a 5 estrellas', async () => {
    const r = await service.reporte(1, {});

    expect(r).toEqual({
      sucursal: 'Centro',
      promedio: 4.3,
      total: 6,
      distribucion: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 4 },
      desde: null,
      hasta: null,
    });
  });

  it('AC2: con un rango usa solo las reseñas del rango, incluido todo el día final', async () => {
    await service.reporte(1, { desde: '2026-11-01', hasta: '2026-11-21' });

    expect(prisma.resena.groupBy.mock.calls[0][0].where).toEqual({
      estado: 'VISIBLE',
      pedido: { sucursalId: 1 },
      creadaEn: {
        gte: new Date('2026-11-01T06:00:00.000Z'),
        lt: new Date('2026-11-22T06:00:00.000Z'),
      },
    });
  });

  it('AC3: con la fecha final anterior a la inicial no genera el reporte y da el mensaje', async () => {
    await expect(
      service.reporte(1, { desde: '2026-11-21', hasta: '2026-11-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.reporte(1, { desde: '2026-11-21', hasta: '2026-11-01' }),
    ).rejects.toThrow('La fecha final no puede ser anterior a la inicial.');
    expect(prisma.resena.groupBy).not.toHaveBeenCalled();
  });

  it('AC4: un periodo sin reseñas visibles da total 0 y sin promedio', async () => {
    prisma.resena.groupBy.mockResolvedValue([]);

    const r = await service.reporte(1, {
      desde: '2026-01-01',
      hasta: '2026-01-31',
    });
    expect(r).toMatchObject({ total: 0, promedio: null });
  });

  it('AC5: solo el gerente ve el reporte y únicamente de su propia sucursal', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, ReporteResenasController)).toEqual([
      Rol.GERENTE,
    ]);
    expect(SIN_PERMISO_REPORTE).toBe('No tienes permiso para ver esta sección');

    await expect(service.reporte(null, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.reporte(2, {});
    expect(prisma.resena.groupBy.mock.calls[0][0].where.pedido).toEqual({
      sucursalId: 2,
    });
  });
});
