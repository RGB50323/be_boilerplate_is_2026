import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuRepository } from '../repository/menu.repository.js';
import { MenuService } from './menu.service.js';

// H01. Consultar el menú digital de una sucursal (backend).
// AC4 (filtros activos en pantalla) y AC5 (mensaje sin resultados) se prueban en el
// frontend: test/h01-menu.test.tsx.

type Fila = Awaited<ReturnType<MenuRepository['findVisibles']>>[number];

const entradas = { id: 1, nombre: 'Entradas' };
const principales = { id: 2, nombre: 'Platillos principales' };

const fila = (
  id: number,
  nombre: string,
  categoria: { id: number; nombre: string },
  precio = 5,
) =>
  ({
    precio,
    disponibilidad: 10,
    platillo: {
      id,
      nombre,
      descripcion: `Descripción de ${nombre}`,
      imagenUrl: `/uploads/platillos/${id}.png`,
      categoria,
    },
  }) as unknown as Fila;

describe('H01. Consultar el menú digital de una sucursal', () => {
  const repo = {
    sucursalExiste: vi.fn(),
    findVisibles: vi.fn(),
    resumenResenas: vi.fn(),
  };
  let service: MenuService;

  beforeEach(() => {
    repo.sucursalExiste.mockReset().mockResolvedValue(true);
    repo.findVisibles.mockReset().mockResolvedValue([]);
    repo.resumenResenas.mockReset().mockResolvedValue([]);
    service = new MenuService(repo as unknown as MenuRepository);
  });

  it('AC1: agrupa los platillos por categoría con nombre, descripción, precio e imagen', async () => {
    repo.findVisibles.mockResolvedValue([
      fila(5, 'Pupusa revuelta', principales, 1.25),
      fila(3, 'Alitas BBQ', entradas, 6.5),
    ]);

    const menu = await service.obtenerMenu(1, {});

    expect(menu.categorias.map((c) => c.nombre)).toEqual([
      'Entradas',
      'Platillos principales',
    ]);
    expect(menu.categorias[1].platillos[0]).toMatchObject({
      nombre: 'Pupusa revuelta',
      descripcion: 'Descripción de Pupusa revuelta',
      precio: 1.25,
      imagenUrl: '/uploads/platillos/5.png',
    });
  });

  it('AC2: solo consulta platillos activos, con disponibilidad mayor a 0 y de categorías activas', async () => {
    const prisma = {
      platilloSucursal: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const repositorio = new MenuRepository(prisma as never);

    await repositorio.findVisibles(1, { categoriaId: 2, precioMax: 5 });

    const { where } = prisma.platilloSucursal.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      sucursalId: 1,
      activo: true,
      disponibilidad: { gt: 0 },
      platillo: { categoriaId: 2, categoria: { activa: true } },
    });
  });

  it('AC3: la búsqueda por parte del nombre ignora mayúsculas y tildes', async () => {
    repo.findVisibles.mockResolvedValue([
      fila(5, 'Pupusa revuelta', principales),
      fila(6, 'Pupusa de frijol', principales),
      fila(3, 'Alitas BBQ', entradas),
    ]);

    const menu = await service.obtenerMenu(1, { q: 'PUPÚ' });

    const nombres = menu.categorias.flatMap((c) =>
      c.platillos.map((p) => p.nombre),
    );
    expect(nombres).toEqual(['Pupusa de frijol', 'Pupusa revuelta']);
  });

  it('AC6: arma el menú filtrado de 500 platillos en menos de 2 segundos', async () => {
    repo.findVisibles.mockResolvedValue(
      Array.from({ length: 500 }, (_, i) =>
        fila(i + 1, `Platillo ${i + 1}`, i % 2 ? entradas : principales),
      ),
    );

    const inicio = performance.now();
    await service.obtenerMenu(1, {
      q: 'platillo 1',
      categoriaId: 1,
      precioMin: 1,
      precioMax: 9,
    });
    expect(performance.now() - inicio).toBeLessThan(2000);
  });
});
