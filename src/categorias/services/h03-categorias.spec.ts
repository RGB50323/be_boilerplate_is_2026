import 'reflect-metadata';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma, Rol } from '@PrismaClient';
import { ROLES_KEY } from '@Auth/decorators';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriasController } from '../controllers/categorias.controller.js';
import { PlatilloCategoriaController } from '../controllers/platillo-categoria.controller.js';
import { GuardarCategoriaDto } from '../dto/guardar-categoria.dto.js';
import type { CategoriasRepository } from '../repositories/categorias.repository.js';
import { MenuRepository } from '../../menu/repository/menu.repository.js';
import { CategoriasService } from './categorias.service.js';

// H03. Gestión de categorías del menú.

describe('H03. Gestión de categorías del menú', () => {
  const repo = {
    crear: vi.fn(),
    renombrar: vi.fn(),
    buscarPorId: vi.fn(),
    contarPlatillosActivos: vi.fn(),
    deshabilitar: vi.fn(),
    buscarPlatillo: vi.fn(),
    asignarCategoria: vi.fn(),
  };
  let service: CategoriasService;

  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    service = new CategoriasService(repo as unknown as CategoriasRepository);
  });

  it('AC1: el gerente agrega una categoría con nombre válido y queda activa', async () => {
    repo.crear.mockResolvedValue({ id: 6, nombre: 'Típicos', activa: true });

    await expect(service.crear('Típicos')).resolves.toMatchObject({
      activa: true,
    });
    expect(repo.crear).toHaveBeenCalledWith('Típicos');
  });

  it('AC2: con el nombre vacío no guarda e indica que el nombre es obligatorio', async () => {
    const dto = plainToInstance(GuardarCategoriaDto, { nombre: '   ' });
    const [error] = await validate(dto);

    expect(error.property).toBe('nombre');
    expect(Object.values(error.constraints ?? {})).toContain(
      'El nombre de la categoría es obligatorio.',
    );
  });

  it('AC3: un nombre repetido no se guarda y se informa que está en uso', async () => {
    repo.crear.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('único', {
        code: 'P2002',
        clientVersion: 't',
      }),
    );

    await expect(service.crear('Bebidas')).rejects.toThrow(
      new ConflictException('Ya existe una categoría con ese nombre.'),
    );
  });

  it('AC4: asocia un platillo de la sucursal del gerente a una categoría activa', async () => {
    repo.buscarPlatillo.mockResolvedValue({ id: 10, sucursales: [{ id: 1 }] });
    repo.buscarPorId.mockResolvedValue({ id: 3, activa: true });

    await expect(service.cambiarCategoriaDePlatillo(10, 3, 1)).resolves.toEqual(
      {
        platilloId: 10,
        categoriaId: 3,
      },
    );
    expect(repo.asignarCategoria).toHaveBeenCalledWith(10, 3);
  });

  it('AC5: al renombrar una categoría se guarda el nuevo nombre que lee el menú', async () => {
    repo.renombrar.mockResolvedValue({
      id: 3,
      nombre: 'Bebidas frías',
      activa: true,
    });

    await expect(service.renombrar(3, 'Bebidas frías')).resolves.toMatchObject({
      nombre: 'Bebidas frías',
    });
    expect(repo.renombrar).toHaveBeenCalledWith(3, 'Bebidas frías');
  });

  it('AC6: deshabilita una categoría activa sin platillos y el menú solo muestra categorías activas', async () => {
    repo.buscarPorId.mockResolvedValue({ id: 3, activa: true });
    repo.contarPlatillosActivos.mockResolvedValue(0);
    repo.deshabilitar.mockResolvedValue({ id: 3, activa: false });

    await service.deshabilitar(3);
    expect(repo.deshabilitar).toHaveBeenCalledWith(3);

    const prisma = {
      platilloSucursal: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await new MenuRepository(prisma as never).findVisibles(1, {});
    expect(
      prisma.platilloSucursal.findMany.mock.calls[0][0].where.platillo,
    ).toMatchObject({
      categoria: { activa: true },
    });
  });

  it('AC7: no deshabilita una categoría con platillos asociados y pide reasignarlos', async () => {
    repo.buscarPorId.mockResolvedValue({ id: 3, activa: true });
    repo.contarPlatillosActivos.mockResolvedValue(4);

    await expect(service.deshabilitar(3)).rejects.toThrow(
      new UnprocessableEntityException(
        'Esta categoría tiene platillos asociados. Reasígnalos antes de deshabilitarla.',
      ),
    );
    expect(repo.deshabilitar).not.toHaveBeenCalled();
  });

  it('AC8: no deshabilita una categoría que ya está deshabilitada', async () => {
    repo.buscarPorId.mockResolvedValue({ id: 3, activa: false });

    await expect(service.deshabilitar(3)).rejects.toThrow(
      new ConflictException('La categoría ya está deshabilitada.'),
    );
    expect(repo.deshabilitar).not.toHaveBeenCalled();
  });

  it('AC9: solo el rol GERENTE puede agregar, modificar, deshabilitar o asociar categorías', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CategoriasController)).toEqual([
      Rol.GERENTE,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, PlatilloCategoriaController)).toEqual(
      [Rol.GERENTE],
    );
  });
});
