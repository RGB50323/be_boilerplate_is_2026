import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResenaRepository } from '../repositories/index.js';
import { ResenasClienteService } from './resenas-cliente.service.js';

const CLIENTE = '9f3dd0b4-843f-44e5-a94f-a574f89a4d33';
const OTRO = '8319753b-9f42-4974-9c34-c4edc134a014';
const AHORA = new Date('2026-11-15T18:00:00Z');
const DIA = 24 * 60 * 60_000;

const pago = (diasAtras: number) => ({
  confirmadoEn: new Date(AHORA.getTime() - diasAtras * DIA),
  creadoEn: new Date(AHORA.getTime() - diasAtras * DIA),
});

const pedido = (cambios = {}) => ({
  clienteId: CLIENTE,
  detalles: [{ id: 1 }],
  pagos: [pago(2)],
  ...cambios,
});

const dto = { pedidoId: 121, platilloId: 10, estrellas: 5, comentario: 'Rico' };

describe('ResenasClienteService', () => {
  const repo = {
    buscarPedidoParaResena: vi.fn(),
    crear: vi.fn(),
    pedidosPorResenar: vi.fn(),
  };
  let service: ResenasClienteService;

  beforeEach(() => {
    vi.resetAllMocks();
    repo.buscarPedidoParaResena.mockResolvedValue(pedido());
    repo.crear.mockResolvedValue({
      id: 501,
      pedidoId: 121,
      platilloId: 10,
      estrellas: 5,
      comentario: 'Rico',
      creadaEn: AHORA,
    });
    service = new ResenasClienteService(repo as unknown as ResenaRepository);
  });

  describe('publicar', () => {
    it('publica y responde "Reseña publicada correctamente"', async () => {
      await expect(service.publicar(CLIENTE, dto, AHORA)).resolves.toEqual({
        mensaje: 'Reseña publicada correctamente',
        resena: {
          id: 501,
          pedidoId: 121,
          platilloId: 10,
          estrellas: 5,
          comentario: 'Rico',
          fecha: '2026-11-15',
        },
      });
      expect(repo.buscarPedidoParaResena).toHaveBeenCalledWith(121, 10);
      expect(repo.crear).toHaveBeenCalledWith({
        pedidoId: 121,
        platilloId: 10,
        clienteId: CLIENTE,
        estrellas: 5,
        comentario: 'Rico',
      });
    });

    it('el comentario es opcional', async () => {
      await service.publicar(
        CLIENTE,
        { pedidoId: 121, platilloId: 10, estrellas: 3 },
        AHORA,
      );
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ comentario: null }),
      );
    });

    it('acepta el pago justo a los 7 días', async () => {
      repo.buscarPedidoParaResena.mockResolvedValue(
        pedido({ pagos: [pago(7)] }),
      );
      await expect(
        service.publicar(CLIENTE, dto, AHORA),
      ).resolves.toBeDefined();
    });

    it('404 si el pedido no existe', async () => {
      repo.buscarPedidoParaResena.mockResolvedValue(null);
      await expect(
        service.publicar(CLIENTE, dto, AHORA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 si el pedido no es mío (o es de mesa, sin cliente)', async () => {
      for (const clienteId of [OTRO, null]) {
        repo.buscarPedidoParaResena.mockResolvedValue(pedido({ clienteId }));
        await expect(
          service.publicar(CLIENTE, dto, AHORA),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('404 si el platillo no está en el pedido', async () => {
      repo.buscarPedidoParaResena.mockResolvedValue(pedido({ detalles: [] }));
      await expect(service.publicar(CLIENTE, dto, AHORA)).rejects.toThrow(
        'Ese platillo no está en tu pedido.',
      );
    });

    it('422 sin pago confirmado', async () => {
      repo.buscarPedidoParaResena.mockResolvedValue(pedido({ pagos: [] }));
      await expect(service.publicar(CLIENTE, dto, AHORA)).rejects.toThrow(
        new UnprocessableEntityException(
          'Solo puedes reseñar pedidos con pago confirmado.',
        ),
      );
    });

    it('422 si el pago tiene más de 7 días', async () => {
      repo.buscarPedidoParaResena.mockResolvedValue(
        pedido({ pagos: [pago(7.01)] }),
      );
      await expect(service.publicar(CLIENTE, dto, AHORA)).rejects.toThrow(
        'Solo puedes reseñar hasta 7 días después del pago.',
      );
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('sin confirmadoEn usa la fecha de creación del pago', async () => {
      repo.buscarPedidoParaResena.mockResolvedValue(
        pedido({
          pagos: [{ confirmadoEn: null, creadoEn: pago(8).creadoEn }],
        }),
      );
      await expect(
        service.publicar(CLIENTE, dto, AHORA),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('409 si ya reseñó ese platillo en el pedido', async () => {
      repo.crear.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.publicar(CLIENTE, dto, AHORA)).rejects.toThrow(
        new ConflictException('Ya reseñaste este platillo en este pedido.'),
      );
    });

    it('otros errores se propagan', async () => {
      repo.crear.mockRejectedValue(new Error('db'));
      await expect(service.publicar(CLIENTE, dto, AHORA)).rejects.toThrow('db');
    });
  });

  describe('pendientes', () => {
    it('busca pedidos pagados en los últimos 7 días', async () => {
      repo.pedidosPorResenar.mockResolvedValue([]);
      await service.pendientes(CLIENTE, AHORA);
      expect(repo.pedidosPorResenar).toHaveBeenCalledWith(
        CLIENTE,
        new Date(AHORA.getTime() - 7 * DIA),
      );
    });

    it('lista los platillos sin reseña, sin repetir, con fecha límite', async () => {
      repo.pedidosPorResenar.mockResolvedValue([
        {
          id: 121,
          numero: 'S1-000121',
          sucursal: { nombre: 'Centro' },
          detalles: [
            { platilloId: 10, platillo: { nombre: 'Pupusas' } },
            { platilloId: 10, platillo: { nombre: 'Pupusas' } },
            { platilloId: 11, platillo: { nombre: 'Horchata' } },
            { platilloId: 12, platillo: { nombre: 'Yuca' } },
          ],
          resenas: [{ platilloId: 11 }],
          pagos: [pago(2)],
        },
      ]);

      const res = await service.pendientes(CLIENTE, AHORA);

      expect(res.map((p) => p.platilloId)).toEqual([10, 12]);
      expect(res[0]).toEqual({
        pedidoId: 121,
        numero: 'S1-000121',
        sucursal: 'Centro',
        platilloId: 10,
        nombre: 'Pupusas',
        disponibleHasta: new Date(AHORA.getTime() + 5 * DIA).toISOString(),
      });
    });
  });
});
