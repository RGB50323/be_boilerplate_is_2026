import 'reflect-metadata';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma, Rol } from '@PrismaClient';
import { ROLES_KEY } from '@Auth/decorators';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatillosController } from '../controllers/platillos.controller.js';
import { GuardarPlatilloDto } from '../dto/guardar-platillo.dto.js';
import type { PlatillosRepository } from '../repositories/platillos.repository.js';
import { PlatillosService } from './platillos.service.js';

// H02. Gestionar los platillos del menú.

const datos = {
  nombre: 'Pupusa revuelta',
  descripcion: 'Con queso',
  precio: 1.25,
  categoriaId: 2,
  disponibilidad: 40,
  imagenUrl: '/uploads/platillos/p.png',
};

const registro = (activo = true, precio = 1.25) => ({
  id: 10,
  nombre: 'Pupusa revuelta',
  descripcion: 'Con queso',
  imagenUrl: '/uploads/platillos/p.png',
  categoriaId: 2,
  categoria: { nombre: 'Platos típicos' },
  sucursales: [
    { precio: { toNumber: () => precio }, disponibilidad: 40, activo },
  ],
});

async function errores(valores: Record<string, unknown>) {
  const dto = plainToInstance(GuardarPlatilloDto, { ...datos, ...valores });
  return (await validate(dto)).map((e) => e.property);
}

describe('H02. Gestionar los platillos del menú', () => {
  const repo = {
    crear: vi.fn(),
    editar: vi.fn(),
    buscarPropio: vi.fn(),
    buscarCategoria: vi.fn(),
    deshabilitar: vi.fn(),
  };
  let service: PlatillosService;

  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    repo.buscarCategoria.mockResolvedValue({ id: 2, activa: true });
    repo.buscarPropio.mockResolvedValue({
      id: 10,
      activo: true,
      categoriaId: 2,
      sucursales: [{ id: 1 }],
    });
    service = new PlatillosService(repo as unknown as PlatillosRepository);
  });

  it('AC1: el gerente agrega un platillo con todos sus datos en su sucursal', async () => {
    repo.crear.mockResolvedValue(registro());

    const creado = await service.crear(1, datos, 1);

    expect(repo.crear).toHaveBeenCalledWith(1, datos);
    expect(creado).toMatchObject({
      nombre: 'Pupusa revuelta',
      precio: 1.25,
      disponibilidad: 40,
      activo: true,
      categoriaNombre: 'Platos típicos',
    });
  });

  it('AC2: al modificar un platillo, habilitado o deshabilitado, se guardan los cambios', async () => {
    repo.buscarPropio.mockResolvedValue({
      id: 10,
      activo: false,
      categoriaId: 2,
      sucursales: [{ id: 1 }],
    });
    repo.editar.mockResolvedValue(registro(false, 2));

    const editado = await service.editar(10, { ...datos, precio: 2 }, 1);

    expect(repo.editar).toHaveBeenCalledWith(10, 1, { ...datos, precio: 2 });
    expect(editado.precio).toBe(2);
  });

  it('AC3: deshabilita un platillo habilitado y rechaza deshabilitarlo de nuevo', async () => {
    repo.deshabilitar.mockResolvedValue({ id: 10, activo: false });
    await service.deshabilitar(10, 1);
    expect(repo.deshabilitar).toHaveBeenCalledWith(10, 1);

    repo.buscarPropio.mockResolvedValue({
      id: 10,
      activo: false,
      categoriaId: 2,
      sucursales: [{ id: 1 }],
    });
    await expect(service.deshabilitar(10, 1)).rejects.toThrow(
      new ConflictException('El platillo ya está deshabilitado.'),
    );
  });

  it('AC4: sin nombre, sin disponibilidad o con precio menor o igual a 0 indica el campo a corregir', async () => {
    expect(await errores({ nombre: '   ' })).toEqual(['nombre']);
    expect(await errores({ disponibilidad: undefined })).toEqual([
      'disponibilidad',
    ]);
    expect(await errores({ precio: 0 })).toEqual(['precio']);
    expect(await errores({ precio: -3 })).toEqual(['precio']);
    expect(await errores({})).toEqual([]);
  });

  it('AC5: un nombre que ya existe responde que el nombre está en uso', async () => {
    repo.crear.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('único', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.crear(1, datos, 1)).rejects.toThrow(
      new ConflictException('Ya existe un platillo con ese nombre.'),
    );
  });

  it('AC6: solo el rol GERENTE gestiona platillos y solo en su sucursal', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, PlatillosController)).toEqual([
      Rol.GERENTE,
    ]);
    for (const metodo of ['crear', 'editar', 'deshabilitar'] as const) {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        PlatillosController.prototype[metodo as keyof PlatillosController],
      );
      expect(roles ?? [Rol.GERENTE]).toEqual([Rol.GERENTE]);
    }
    await expect(service.crear(2, datos, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });
});
