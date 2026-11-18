import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResenaRepository } from '../repositories/index.js';
import {
  RANGO_INVALIDO,
  ReporteResenasService,
  SIN_PERMISO_REPORTE,
} from './reporte-resenas.service.js';

describe('ReporteResenasService', () => {
  const repo = {
    nombreSucursal: vi.fn(),
    distribucionSucursal: vi.fn(),
  };
  let service: ReporteResenasService;

  beforeEach(() => {
    vi.resetAllMocks();
    repo.nombreSucursal.mockResolvedValue({ nombre: 'Centro' });
    repo.distribucionSucursal.mockResolvedValue([
      { estrellas: 5, _count: { _all: 3 } },
      { estrellas: 4, _count: { _all: 1 } },
      { estrellas: 1, _count: { _all: 1 } },
    ]);
    service = new ReporteResenasService(repo as unknown as ResenaRepository);
  });

  it('calcula promedio con un decimal, total y distribución de la sucursal', async () => {
    await expect(service.reporte(1, {})).resolves.toEqual({
      sucursal: 'Centro',
      // (5*3 + 4 + 1) / 5 = 4.0
      promedio: 4,
      total: 5,
      distribucion: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 3 },
      desde: null,
      hasta: null,
    });
    expect(repo.distribucionSucursal).toHaveBeenCalledWith(
      1,
      undefined,
      undefined,
    );
  });

  it('redondea a un decimal', async () => {
    repo.distribucionSucursal.mockResolvedValue([
      { estrellas: 5, _count: { _all: 2 } },
      { estrellas: 4, _count: { _all: 1 } },
    ]);
    // 14 / 3 = 4.666...
    await expect(service.reporte(1, {})).resolves.toMatchObject({
      promedio: 4.7,
    });
  });

  it('el rango incluye todo el día final en hora de El Salvador', async () => {
    await service.reporte(1, { desde: '2026-11-01', hasta: '2026-11-15' });
    expect(repo.distribucionSucursal).toHaveBeenCalledWith(
      1,
      new Date('2026-11-01T06:00:00Z'),
      new Date('2026-11-16T06:00:00Z'),
    );
  });

  it('acepta un rango de un solo día', async () => {
    await expect(
      service.reporte(1, { desde: '2026-11-15', hasta: '2026-11-15' }),
    ).resolves.toMatchObject({ desde: '2026-11-15', hasta: '2026-11-15' });
  });

  it('rechaza una fecha final anterior a la inicial', async () => {
    await expect(
      service.reporte(1, { desde: '2026-11-15', hasta: '2026-11-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reporte(1, { desde: '2026-11-15', hasta: '2026-11-01' }),
    ).rejects.toThrow(RANGO_INVALIDO);
    expect(repo.distribucionSucursal).not.toHaveBeenCalled();
  });

  it('sin reseñas devuelve total 0 y promedio null', async () => {
    repo.distribucionSucursal.mockResolvedValue([]);
    await expect(service.reporte(1, {})).resolves.toMatchObject({
      promedio: null,
      total: 0,
      distribucion: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('un gerente sin sucursal no tiene acceso', async () => {
    await expect(service.reporte(null, {})).rejects.toThrow(
      new ForbiddenException(SIN_PERMISO_REPORTE),
    );
  });
});
