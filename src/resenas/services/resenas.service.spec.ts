import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResenaRepository } from '../repositories/index.js';
import { nombrePublico, ResenasService } from './resenas.service.js';

const resena = (
  id: number,
  creadaEn: string,
  nombre = 'Ana',
  apellido = 'López',
) => ({
  id,
  estrellas: 5,
  comentario: 'Muy buenas',
  creadaEn: new Date(creadaEn),
  cliente: { nombre, apellido },
});

describe('ResenasService', () => {
  const repo = {
    platilloActivo: vi.fn(),
    resumen: vi.fn(),
    distribucion: vi.fn(),
    findPagina: vi.fn(),
  };
  let service: ResenasService;

  beforeEach(() => {
    vi.resetAllMocks();
    repo.platilloActivo.mockResolvedValue(true);
    repo.resumen.mockResolvedValue({
      _avg: { estrellas: 4.56 },
      _count: { _all: 23 },
    });
    repo.distribucion.mockResolvedValue([]);
    repo.findPagina.mockResolvedValue([]);
    service = new ResenasService(repo as unknown as ResenaRepository);
  });

  it('responde 404 si el platillo no existe o está deshabilitado', async () => {
    repo.platilloActivo.mockResolvedValue(false);
    await expect(service.listarPorPlatillo(99, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findPagina).not.toHaveBeenCalled();
  });

  it('devuelve promedio a un decimal, total y páginas de 10', async () => {
    const res = await service.listarPorPlatillo(7, 1);
    expect(res).toMatchObject({
      promedio: 4.6,
      total: 23,
      pagina: 1,
      totalPaginas: 3,
    });
    expect(repo.findPagina).toHaveBeenCalledWith(7, 0, 10);
  });

  it('arma la distribución por estrellas con ceros donde no hay', async () => {
    repo.distribucion.mockResolvedValue([
      { estrellas: 5, _count: { _all: 15 } },
      { estrellas: 1, _count: { _all: 2 } },
    ]);
    const res = await service.listarPorPlatillo(7, 1);
    expect(res.distribucion).toEqual({ 1: 2, 2: 0, 3: 0, 4: 0, 5: 15 });
  });

  it('calcula el salto según la página', async () => {
    await service.listarPorPlatillo(7, 3);
    expect(repo.findPagina).toHaveBeenCalledWith(7, 20, 10);
  });

  it('sin reseñas devuelve promedio null, total 0 y lista vacía', async () => {
    repo.resumen.mockResolvedValue({
      _avg: { estrellas: null },
      _count: { _all: 0 },
    });
    await expect(service.listarPorPlatillo(7, 1)).resolves.toEqual({
      promedio: null,
      total: 0,
      distribucion: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      pagina: 1,
      totalPaginas: 0,
      resenas: [],
    });
  });

  it('formatea la fecha en hora de El Salvador y protege el apellido', async () => {
    // 2026-10-29 03:00 UTC = 2026-10-28 21:00 en El Salvador
    repo.findPagina.mockResolvedValue([resena(1, '2026-10-29T03:00:00Z')]);
    const res = await service.listarPorPlatillo(7, 1);
    expect(res.resenas[0]).toEqual({
      id: 1,
      estrellas: 5,
      comentario: 'Muy buenas',
      fecha: '2026-10-28',
      cliente: 'Ana L.',
    });
  });
});

describe('nombrePublico', () => {
  it.each([
    ['Ana', 'López', 'Ana L.'],
    ['ana', 'ábrego', 'ana Á.'],
    ['Luis', null, 'Luis'],
    [null, 'Pérez', 'Cliente P.'],
    ['  ', '', 'Cliente'],
  ])('%s %s -> %s', (nombre, apellido, esperado) => {
    expect(nombrePublico(nombre, apellido)).toBe(esperado);
  });
});
