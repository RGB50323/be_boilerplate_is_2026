import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuRepository } from '../repository/menu.repository.js';
import { MenuService } from './menu.service.js';

type Fila = Awaited<ReturnType<MenuRepository['findVisibles']>>[number];

const bebidas = { id: 3, nombre: 'Bebidas' };
const entradas = { id: 1, nombre: 'Entradas' };
const principales = { id: 2, nombre: 'Platillos principales' };

const fila = (
  id: number,
  nombre: string,
  categoria: { id: number; nombre: string },
  precio: unknown = 1,
  disponibilidad = 10,
) =>
  ({
    precio,
    disponibilidad,
    platillo: { id, nombre, descripcion: null, imagenUrl: null, categoria },
  }) as unknown as Fila;

describe('MenuService', () => {
  const repo = { sucursalExiste: vi.fn(), findVisibles: vi.fn() };
  let service: MenuService;

  beforeEach(() => {
    repo.sucursalExiste.mockReset().mockResolvedValue(true);
    repo.findVisibles.mockReset().mockResolvedValue([]);
    service = new MenuService(repo as unknown as MenuRepository);
  });

  it('rechaza precioMin mayor que precioMax con 400 sin consultar la base', async () => {
    await expect(
      service.obtenerMenu(1, { precioMin: 10, precioMax: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.findVisibles).not.toHaveBeenCalled();
  });

  it('acepta precioMin igual a precioMax', async () => {
    await expect(
      service.obtenerMenu(1, { precioMin: 3, precioMax: 3 }),
    ).resolves.toEqual({ sucursalId: 1, categorias: [] });
  });

  it('responde 404 si la sucursal no existe', async () => {
    repo.sucursalExiste.mockResolvedValue(false);
    await expect(service.obtenerMenu(999, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findVisibles).not.toHaveBeenCalled();
  });

  it('agrupa por categoría y ordena categorías y platillos por nombre', async () => {
    repo.findVisibles.mockResolvedValue([
      fila(5, 'Pupusa revuelta', principales),
      fila(9, 'Horchata', bebidas),
      fila(3, 'Alitas BBQ', entradas),
      fila(7, 'Costillas BBQ', principales),
    ]);

    const menu = await service.obtenerMenu(1, {});

    expect(menu.categorias.map((c) => c.nombre)).toEqual([
      'Bebidas',
      'Entradas',
      'Platillos principales',
    ]);
    expect(
      menu.categorias[2].platillos.map((p) => p.nombre),
    ).toEqual(['Costillas BBQ', 'Pupusa revuelta']);
  });

  it.each(['PUPÚ', 'pupu', 'Pupusa'])(
    'la búsqueda ignora mayúsculas y tildes: %s',
    async (q) => {
      repo.findVisibles.mockResolvedValue([
        fila(5, 'Pupusa revuelta', principales),
        fila(9, 'Café con leche', bebidas),
      ]);

      const menu = await service.obtenerMenu(1, { q });

      expect(menu.categorias).toHaveLength(1);
      expect(menu.categorias[0].platillos[0].nombre).toBe('Pupusa revuelta');
    },
  );

  it('encuentra un nombre con tilde buscando sin ella', async () => {
    repo.findVisibles.mockResolvedValue([fila(9, 'Café con leche', bebidas)]);
    const menu = await service.obtenerMenu(1, { q: 'CAFE' });
    expect(menu.categorias[0].platillos[0].nombre).toBe('Café con leche');
  });

  it('sin coincidencias devuelve categorias vacío, no un error', async () => {
    repo.findVisibles.mockResolvedValue([fila(5, 'Pupusa revuelta', principales)]);
    await expect(service.obtenerMenu(1, { q: 'zzz' })).resolves.toEqual({
      sucursalId: 1,
      categorias: [],
    });
  });

  it('convierte el precio (Decimal) a número', async () => {
    repo.findVisibles.mockResolvedValue([
      fila(5, 'Pupusa revuelta', principales, { toString: () => '1.25' }),
    ]);
    const menu = await service.obtenerMenu(1, {});
    expect(menu.categorias[0].platillos[0].precio).toBe(1.25);
  });

  it('pasa al repositorio la sucursal y los filtros de categoría y precio, sin la búsqueda', async () => {
    await service.obtenerMenu(1, {
      q: 'pupu',
      categoriaId: 2,
      precioMin: 1,
      precioMax: 5,
    });
    expect(repo.findVisibles).toHaveBeenCalledWith(1, {
      categoriaId: 2,
      precioMin: 1,
      precioMax: 5,
    });
  });
});