import 'reflect-metadata';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IS_PUBLIC_KEY, ROLES_KEY } from '@Auth/decorators';
import { EstadoPago, Prisma, Rol } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResenasClienteController } from '../controllers/resenas-cliente.controller.js';
import { PublicarResenaDto } from '../dto/index.js';
import { ResenaRepository } from '../repositories/index.js';
import { ResenasClienteService } from './resenas-cliente.service.js';
import { ResenasService } from './resenas.service.js';

// H21. Calificar un platillo que pedí (backend).
// El contador de caracteres y el envío al login también se prueban en el frontend:
// test/h21-calificar-platillo.test.tsx.

const AHORA = new Date('2026-11-21T18:00:00Z');
const diasAntes = (d: number) =>
  new Date(AHORA.getTime() - d * 24 * 60 * 60_000);

const pedido = (extra: Record<string, unknown> = {}) => ({
  clienteId: 'c-1',
  detalles: [{ id: 1 }],
  pagos: [{ confirmadoEn: diasAntes(2), creadoEn: diasAntes(2) }],
  ...extra,
});

const dto = {
  pedidoId: 121,
  platilloId: 10,
  estrellas: 5,
  comentario: 'Muy rica',
};

describe('H21. Calificar un platillo que pedí', () => {
  const repo = { buscarPedidoParaResena: vi.fn(), crear: vi.fn() };
  let service: ResenasClienteService;

  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    repo.buscarPedidoParaResena.mockResolvedValue(pedido());
    repo.crear.mockImplementation(async (d) => ({
      id: 40,
      creadaEn: AHORA,
      ...d,
    }));
    service = new ResenasClienteService(repo as never);
  });

  it('AC1: con un pedido propio pagado hace 7 días o menos, publica 1 a 5 estrellas y comentario opcional', async () => {
    const r = await service.publicar('c-1', dto, AHORA);
    expect(r.mensaje).toBe('Reseña publicada correctamente');

    for (const estrellas of [0, 6]) {
      const errores = await validate(
        plainToInstance(PublicarResenaDto, { ...dto, estrellas }),
      );
      expect(errores.map((e) => e.property)).toEqual(['estrellas']);
    }
    const sinComentario = await validate(
      plainToInstance(PublicarResenaDto, { ...dto, comentario: undefined }),
    );
    expect(sinComentario).toEqual([]);
  });

  it('AC2: la reseña publicada queda visible y entra al promedio del platillo', async () => {
    await service.publicar('c-1', dto, AHORA);
    expect(repo.crear.mock.calls[0][0]).toMatchObject({
      platilloId: 10,
      estrellas: 5,
    });

    const aggregate = vi
      .fn()
      .mockResolvedValue({ _avg: { estrellas: 4.25 }, _count: { _all: 4 } });
    await new ResenaRepository({ resena: { aggregate } } as never).resumen(10);
    expect(aggregate.mock.calls[0][0].where).toEqual({
      platilloId: 10,
      estado: 'VISIBLE',
    });

    const lectura = {
      platilloActivo: vi.fn().mockResolvedValue(true),
      resumen: vi
        .fn()
        .mockResolvedValue({ _avg: { estrellas: 4.25 }, _count: { _all: 4 } }),
      distribucion: vi.fn().mockResolvedValue([]),
      findPagina: vi.fn().mockResolvedValue([]),
    };
    const consulta = await new ResenasService(
      lectura as never,
    ).listarPorPlatillo(10, 1);
    expect(consulta).toMatchObject({ promedio: 4.3, total: 4 });
  });

  it('AC3: si ya calificó ese platillo en ese pedido se indica que ya lo reseñó', async () => {
    repo.crear.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('único', {
        code: 'P2002',
        clientVersion: 't',
      }),
    );

    await expect(service.publicar('c-1', dto, AHORA)).rejects.toThrow(
      new ConflictException('Ya reseñaste este platillo en este pedido.'),
    );
  });

  it('AC4: un comentario de más de 500 caracteres no se permite', async () => {
    const errores = await validate(
      plainToInstance(PublicarResenaDto, {
        ...dto,
        comentario: 'a'.repeat(501),
      }),
    );
    expect(errores.map((e) => e.property)).toEqual(['comentario']);
  });

  it('AC5: no permite calificar un pedido de más de 7 días, sin pago confirmado o ajeno', async () => {
    repo.buscarPedidoParaResena.mockResolvedValue(
      pedido({
        pagos: [{ confirmadoEn: diasAntes(8), creadoEn: diasAntes(8) }],
      }),
    );
    await expect(service.publicar('c-1', dto, AHORA)).rejects.toThrow(
      new UnprocessableEntityException(
        'Solo puedes reseñar hasta 7 días después del pago.',
      ),
    );

    repo.buscarPedidoParaResena.mockResolvedValue(pedido({ pagos: [] }));
    await expect(service.publicar('c-1', dto, AHORA)).rejects.toThrow(
      'Solo puedes reseñar pedidos con pago confirmado.',
    );

    repo.buscarPedidoParaResena.mockResolvedValue(
      pedido({ clienteId: 'otro' }),
    );
    await expect(service.publicar('c-1', dto, AHORA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const findUnique = vi.fn();
    await new ResenaRepository({
      pedido: { findUnique },
    } as never).buscarPedidoParaResena(121, 10);
    expect(JSON.stringify(findUnique.mock.calls[0][0])).toContain(
      EstadoPago.CONFIRMADO,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('AC6: calificar requiere sesión de cliente (la ruta no es pública)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ResenasClienteController)).toEqual([
      Rol.CLIENTE,
    ]);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, ResenasClienteController),
    ).toBeUndefined();
  });
});
