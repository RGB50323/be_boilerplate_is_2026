import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { CategoriasRepository } from '@Categorias/repositories';
import { CATEGORIAS_POR_PAGINA, CategoriasService } from './categorias.service.js';

function errorPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('error', {
    code,
    clientVersion: 'test',
  });
}

function crearContexto() {
  const repository = {
    crear: vi.fn(),
    renombrar: vi.fn(),
    listar: vi.fn(),
    listarActivas: vi.fn(),
    buscarPorId: vi.fn(),
    contarPlatillosActivos: vi.fn(),
    deshabilitar: vi.fn(),
    listarPlatillosActivos: vi.fn(),
    buscarPlatillo: vi.fn(),
    asignarCategoria: vi.fn(),
  };
  const service = new CategoriasService(
    repository as unknown as CategoriasRepository,
  );
  return { service, repository };
}

describe('CategoriasService', () => {
  describe('crear', () => {
    it('guarda la categoría y la devuelve activa', async () => {
      const { service, repository } = crearContexto();
      const creada = { id: 6, nombre: 'Típicos', activa: true };
      repository.crear.mockResolvedValue(creada);

      await expect(service.crear('Típicos')).resolves.toEqual(creada);
      expect(repository.crear).toHaveBeenCalledWith('Típicos');
    });

    it('responde 409 si el nombre ya existe (violación del índice único)', async () => {
      const { service, repository } = crearContexto();
      repository.crear.mockRejectedValue(errorPrisma('P2002'));

      await expect(service.crear('Entradas')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('relanza los errores que no conoce', async () => {
      const { service, repository } = crearContexto();
      const fallo = new Error('BD caída');
      repository.crear.mockRejectedValue(fallo);

      await expect(service.crear('Postres')).rejects.toBe(fallo);
    });
  });

  describe('renombrar', () => {
    it('renombra y devuelve la categoría', async () => {
      const { service, repository } = crearContexto();
      const renombrada = { id: 6, nombre: 'Platos típicos', activa: true };
      repository.renombrar.mockResolvedValue(renombrada);

      await expect(service.renombrar(6, 'Platos típicos')).resolves.toEqual(
        renombrada,
      );
      expect(repository.renombrar).toHaveBeenCalledWith(6, 'Platos típicos');
    });

    it('responde 409 si el nombre ya lo usa otra categoría', async () => {
      const { service, repository } = crearContexto();
      repository.renombrar.mockRejectedValue(errorPrisma('P2002'));

      await expect(service.renombrar(6, 'Bebidas')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('responde 404 si la categoría no existe', async () => {
      const { service, repository } = crearContexto();
      repository.renombrar.mockRejectedValue(errorPrisma('P2025'));

      await expect(service.renombrar(999, 'Algo')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listar', () => {
    it('devuelve las categorías paginadas con la cantidad de platillos activos', async () => {
      const { service, repository } = crearContexto();
      const deshabilitadaEn = new Date('2026-11-01T10:00:00.000Z');
      repository.listar.mockResolvedValue({
        total: 14,
        categorias: [
          {
            id: 1,
            nombre: 'Entradas',
            activa: true,
            deshabilitadaEn: null,
            _count: { platillos: 3 },
          },
          {
            id: 5,
            nombre: 'Temporada',
            activa: false,
            deshabilitadaEn,
            _count: { platillos: 0 },
          },
        ],
      });

      await expect(service.listar(1)).resolves.toEqual({
        pagina: 1,
        totalPaginas: 2,
        total: 14,
        datos: [
          {
            id: 1,
            nombre: 'Entradas',
            activa: true,
            deshabilitadaEn: null,
            platillosActivos: 3,
          },
          {
            id: 5,
            nombre: 'Temporada',
            activa: false,
            deshabilitadaEn,
            platillosActivos: 0,
          },
        ],
      });
      expect(repository.listar).toHaveBeenCalledWith(0, CATEGORIAS_POR_PAGINA);
    });

    it('calcula el salto según la página', async () => {
      const { service, repository } = crearContexto();
      repository.listar.mockResolvedValue({ total: 14, categorias: [] });

      await service.listar(2);

      expect(repository.listar).toHaveBeenCalledWith(
        CATEGORIAS_POR_PAGINA,
        CATEGORIAS_POR_PAGINA,
      );
    });
  });

  describe('listarActivas', () => {
    it('devuelve las categorías activas sin paginar', async () => {
      const { service, repository } = crearContexto();
      const activas = [{ id: 1, nombre: 'Entradas', activa: true }];
      repository.listarActivas.mockResolvedValue(activas);

      await expect(service.listarActivas()).resolves.toEqual(activas);
    });
  });

  describe('listarPlatillos', () => {
    it('responde 404 si la categoría no existe', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPorId.mockResolvedValue(null);

      await expect(service.listarPlatillos(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.listarPlatillosActivos).not.toHaveBeenCalled();
    });

    it('devuelve los platillos activos de la categoría', async () => {
      const { service, repository } = crearContexto();
      const platillos = [{ id: 5, nombre: 'Pupusa revuelta' }];
      repository.buscarPorId.mockResolvedValue({ id: 2, activa: true });
      repository.listarPlatillosActivos.mockResolvedValue(platillos);

      await expect(service.listarPlatillos(2)).resolves.toEqual(platillos);
      expect(repository.listarPlatillosActivos).toHaveBeenCalledWith(2);
    });
  });

  describe('deshabilitar', () => {
    it('responde 404 si la categoría no existe', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPorId.mockResolvedValue(null);

      await expect(service.deshabilitar(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('responde 409 si ya estaba deshabilitada, sin contar platillos ni modificar', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPorId.mockResolvedValue({ id: 5, activa: false });

      await expect(service.deshabilitar(5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.contarPlatillosActivos).not.toHaveBeenCalled();
      expect(repository.deshabilitar).not.toHaveBeenCalled();
    });

    it('responde 422 y no cambia nada si tiene platillos activos', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPorId.mockResolvedValue({ id: 2, activa: true });
      repository.contarPlatillosActivos.mockResolvedValue(4);

      await expect(service.deshabilitar(2)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(repository.deshabilitar).not.toHaveBeenCalled();
    });

    it('deshabilita una categoría activa sin platillos activos', async () => {
      const { service, repository } = crearContexto();
      const resultado = {
        id: 6,
        activa: false,
        deshabilitadaEn: new Date('2026-11-08T20:00:00.000Z'),
      };
      repository.buscarPorId.mockResolvedValue({ id: 6, activa: true });
      repository.contarPlatillosActivos.mockResolvedValue(0);
      repository.deshabilitar.mockResolvedValue(resultado);

      await expect(service.deshabilitar(6)).resolves.toEqual(resultado);
      expect(repository.contarPlatillosActivos).toHaveBeenCalledWith(6);
    });
  });

  describe('cambiarCategoriaDePlatillo', () => {
    it('responde 404 si el platillo no existe, sin consultar la categoría', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPlatillo.mockResolvedValue(null);

      await expect(
        service.cambiarCategoriaDePlatillo(999, 2),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.buscarPorId).not.toHaveBeenCalled();
    });

    it('responde 404 si la categoría no existe', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPlatillo.mockResolvedValue({ id: 5 });
      repository.buscarPorId.mockResolvedValue(null);

      await expect(
        service.cambiarCategoriaDePlatillo(5, 999),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 422 y no asigna si la categoría está deshabilitada', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPlatillo.mockResolvedValue({ id: 5 });
      repository.buscarPorId.mockResolvedValue({ id: 5, activa: false });

      await expect(
        service.cambiarCategoriaDePlatillo(5, 5),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.asignarCategoria).not.toHaveBeenCalled();
    });

    it('asigna la categoría y devuelve los ids', async () => {
      const { service, repository } = crearContexto();
      repository.buscarPlatillo.mockResolvedValue({ id: 5 });
      repository.buscarPorId.mockResolvedValue({ id: 6, activa: true });
      repository.asignarCategoria.mockResolvedValue({ id: 5, categoriaId: 6 });

      await expect(service.cambiarCategoriaDePlatillo(5, 6)).resolves.toEqual({
        platilloId: 5,
        categoriaId: 6,
      });
      expect(repository.asignarCategoria).toHaveBeenCalledWith(5, 6);
    });
  });
});
