import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import type { GuardarPlatilloDto } from '../dto/index.js';
import type { PlatillosRepository } from '../repositories/platillos.repository.js';
import { PlatillosService } from './platillos.service.js';

const repository = {
  listar: vi.fn(),
  crear: vi.fn(),
  editar: vi.fn(),
  buscarPropio: vi.fn(),
  buscarCategoria: vi.fn(),
  deshabilitar: vi.fn(),
};

const dto: GuardarPlatilloDto = {
  nombre: 'Pupusa revuelta',
  precio: 1.25,
  categoriaId: 2,
  disponibilidad: 40,
};

function registro(extra: Record<string, unknown> = {}) {
  return {
    id: 10,
    nombre: 'Pupusa revuelta',
    descripcion: null,
    imagenUrl: null,
    activo: true,
    categoriaId: 2,
    categoria: { nombre: 'Platos típicos' },
    sucursales: [{ precio: { toNumber: () => 1.25 }, disponibilidad: 40 }],
    ...extra,
  };
}

function propio(extra: Record<string, unknown> = {}) {
  return {
    id: 10,
    activo: true,
    categoriaId: 2,
    sucursales: [{ id: 1 }],
    ...extra,
  };
}

function errorPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('error', {
    code,
    clientVersion: 'test',
  });
}

describe('PlatillosService', () => {
  let service: PlatillosService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new PlatillosService(
      repository as unknown as PlatillosRepository,
    );
  });

  describe('listar', () => {
    it('devuelve los platillos en forma plana', async () => {
      repository.listar.mockResolvedValue([registro()]);

      const resultado = await service.listar(1, 1);

      expect(resultado).toEqual([
        {
          id: 10,
          nombre: 'Pupusa revuelta',
          descripcion: null,
          imagenUrl: null,
          categoriaId: 2,
          categoriaNombre: 'Platos típicos',
          precio: 1.25,
          disponibilidad: 40,
          activo: true,
        },
      ]);
      expect(repository.listar).toHaveBeenCalledWith(1);
    });

    it('rechaza con 403 una sucursal distinta a la del gerente', async () => {
      const promesa = service.listar(2, 1);

      await expect(promesa).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.listar).not.toHaveBeenCalled();
    });

    it('rechaza con 403 si el gerente no tiene sucursal', async () => {
      await expect(service.listar(1, null)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('crear', () => {
    it('crea el platillo y lo devuelve', async () => {
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: true });
      repository.crear.mockResolvedValue(registro());

      const resultado = await service.crear(1, dto, 1);

      expect(resultado.id).toBe(10);
      expect(resultado.precio).toBe(1.25);
      expect(repository.crear).toHaveBeenCalledWith(1, dto);
    });

    it('rechaza con 403 una sucursal ajena sin consultar nada', async () => {
      const promesa = service.crear(2, dto, 1);

      await expect(promesa).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.buscarCategoria).not.toHaveBeenCalled();
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('responde 404 si la categoría no existe', async () => {
      repository.buscarCategoria.mockResolvedValue(null);

      const promesa = service.crear(1, dto, 1);

      await expect(promesa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promesa).rejects.toThrow('La categoría no existe.');
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('responde 422 si la categoría está deshabilitada', async () => {
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: false });

      const promesa = service.crear(1, dto, 1);

      await expect(promesa).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(promesa).rejects.toThrow('La categoría está deshabilitada.');
    });

    it('traduce P2002 a 409 de nombre duplicado', async () => {
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: true });
      repository.crear.mockRejectedValue(errorPrisma('P2002'));

      const promesa = service.crear(1, dto, 1);

      await expect(promesa).rejects.toBeInstanceOf(ConflictException);
      await expect(promesa).rejects.toThrow(
        'Ya existe un platillo con ese nombre.',
      );
    });

    it('relanza los errores desconocidos sin traducirlos', async () => {
      const inesperado = new Error('falló la conexión');
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: true });
      repository.crear.mockRejectedValue(inesperado);

      await expect(service.crear(1, dto, 1)).rejects.toBe(inesperado);
    });
  });

  describe('editar', () => {
    it('edita el platillo y lo devuelve', async () => {
      repository.buscarPropio.mockResolvedValue(propio());
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: true });
      repository.editar.mockResolvedValue(registro({ nombre: 'Nuevo' }));

      const resultado = await service.editar(10, dto, 1);

      expect(resultado.nombre).toBe('Nuevo');
      expect(repository.buscarPropio).toHaveBeenCalledWith(10, 1);
      expect(repository.editar).toHaveBeenCalledWith(10, 1, dto);
    });

    it('responde 404 si el platillo no existe', async () => {
      repository.buscarPropio.mockResolvedValue(null);

      const promesa = service.editar(10, dto, 1);

      await expect(promesa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promesa).rejects.toThrow('El platillo no existe.');
    });

    it('responde 403 si el platillo no es de la sucursal del gerente', async () => {
      repository.buscarPropio.mockResolvedValue(propio({ sucursales: [] }));

      await expect(service.editar(10, dto, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.editar).not.toHaveBeenCalled();
    });

    it('responde 403 si el gerente no tiene sucursal', async () => {
      await expect(service.editar(10, dto, null)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.buscarPropio).not.toHaveBeenCalled();
    });

    it('responde 422 al cambiar a una categoría deshabilitada', async () => {
      repository.buscarPropio.mockResolvedValue(propio({ categoriaId: 3 }));
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: false });

      await expect(service.editar(10, dto, 1)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(repository.editar).not.toHaveBeenCalled();
    });

    it('no exige categoría activa si la categoría no cambia', async () => {
      repository.buscarPropio.mockResolvedValue(propio({ categoriaId: 2 }));
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: false });
      repository.editar.mockResolvedValue(registro());

      await expect(service.editar(10, dto, 1)).resolves.toBeDefined();
    });

    it('permite editar un platillo deshabilitado', async () => {
      repository.buscarPropio.mockResolvedValue(propio({ activo: false }));
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: true });
      repository.editar.mockResolvedValue(registro({ activo: false }));

      const resultado = await service.editar(10, dto, 1);

      expect(resultado.activo).toBe(false);
    });

    it('traduce P2002 a 409 y P2025 a 404', async () => {
      repository.buscarPropio.mockResolvedValue(propio());
      repository.buscarCategoria.mockResolvedValue({ id: 2, activa: true });

      repository.editar.mockRejectedValueOnce(errorPrisma('P2002'));
      await expect(service.editar(10, dto, 1)).rejects.toBeInstanceOf(
        ConflictException,
      );

      repository.editar.mockRejectedValueOnce(errorPrisma('P2025'));
      await expect(service.editar(10, dto, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deshabilitar', () => {
    it('deshabilita un platillo activo', async () => {
      repository.buscarPropio.mockResolvedValue(propio());
      repository.deshabilitar.mockResolvedValue({ id: 10, activo: false });

      const resultado = await service.deshabilitar(10, 1);

      expect(resultado).toEqual({ id: 10, activo: false });
      expect(repository.deshabilitar).toHaveBeenCalledWith(10);
    });

    it('responde 409 si ya estaba deshabilitado', async () => {
      repository.buscarPropio.mockResolvedValue(propio({ activo: false }));

      const promesa = service.deshabilitar(10, 1);

      await expect(promesa).rejects.toBeInstanceOf(ConflictException);
      await expect(promesa).rejects.toThrow(
        'El platillo ya está deshabilitado.',
      );
      expect(repository.deshabilitar).not.toHaveBeenCalled();
    });

    it('responde 404 si el platillo no existe', async () => {
      repository.buscarPropio.mockResolvedValue(null);

      await expect(service.deshabilitar(10, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('responde 403 si el platillo es de otra sucursal', async () => {
      repository.buscarPropio.mockResolvedValue(propio({ sucursales: [] }));

      await expect(service.deshabilitar(10, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.deshabilitar).not.toHaveBeenCalled();
    });
  });
});
