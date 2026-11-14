import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type User } from '@PrismaClient';
import type { CrearPedidoDto } from '../dto/index.js';
import {
  DisponibilidadInsuficienteError,
  type PedidosRepository,
} from '../repositories/pedidos.repository.js';
import { PedidosService } from './pedidos.service.js';

const repository = {
  buscarMesa: vi.fn(),
  buscarPlatillos: vi.fn(),
  buscarPedidoAbierto: vi.fn(),
  crear: vi.fn(),
};

const mesero = { id: 'mesero-1', sucursalId: 1 } as unknown as User;

const dto: CrearPedidoDto = {
  tipo: 'MESA',
  mesaId: 7,
  items: [{ platilloId: 10, cantidad: 3, nota: 'sin curtido' }],
};

function mesa(extra: Record<string, unknown> = {}) {
  return { id: 7, sucursalId: 1, activa: true, ...extra };
}

function platillo(extra: Record<string, unknown> = {}) {
  return {
    id: 10,
    nombre: 'Pupusa revuelta',
    activo: true,
    categoria: { activa: true },
    sucursales: [{ precio: new Prisma.Decimal('3.5'), disponibilidad: 40 }],
    ...extra,
  };
}

function errorPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('error', {
    code,
    clientVersion: 'test',
  });
}

function pedido(items: CrearPedidoDto['items']): CrearPedidoDto {
  return { tipo: 'MESA', mesaId: 7, items };
}

function preparar() {
  repository.buscarMesa.mockResolvedValue(mesa());
  repository.buscarPedidoAbierto.mockResolvedValue(null);
  repository.buscarPlatillos.mockResolvedValue([platillo()]);
  repository.crear.mockResolvedValue({
    id: 120,
    numero: 'S1-000120',
    estado: 'ENVIADO_COCINA',
    total: new Prisma.Decimal('10.5'),
    creadoEn: new Date('2026-10-30T18:05:00.000Z'),
  });
}

describe('PedidosService', () => {
  let service: PedidosService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new PedidosService(repository as unknown as PedidosRepository);
  });

  describe('crear', () => {
    it('crea el pedido y devuelve número, estado, total y fecha', async () => {
      preparar();

      const resultado = await service.crear(dto, mesero);

      expect(resultado).toEqual({
        pedidoId: 120,
        numero: 'S1-000120',
        estado: 'ENVIADO_COCINA',
        total: 10.5,
        creadoEn: '2026-10-30T18:05:00.000Z',
      });
      expect(repository.crear).toHaveBeenCalledWith({
        sucursalId: 1,
        mesaId: 7,
        meseroId: 'mesero-1',
        total: new Prisma.Decimal('10.5'),
        items: [
          {
            platilloId: 10,
            cantidad: 3,
            nota: 'sin curtido',
            precioUnitario: new Prisma.Decimal('3.5'),
          },
        ],
      });
    });

    it('calcula el total sumando precio por cantidad de cada platillo', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([
        platillo(),
        platillo({
          id: 12,
          nombre: 'Horchata',
          sucursales: [
            { precio: new Prisma.Decimal('2.25'), disponibilidad: 30 },
          ],
        }),
      ]);

      await service.crear(
        pedido([
          { platilloId: 10, cantidad: 2 },
          { platilloId: 12, cantidad: 3 },
        ]),
        mesero,
      );

      expect(repository.crear).toHaveBeenCalledWith(
        expect.objectContaining({ total: new Prisma.Decimal('13.75') }),
      );
    });

    it('guarda la nota vacía o ausente como null', async () => {
      preparar();

      await service.crear(
        pedido([
          { platilloId: 10, cantidad: 1, nota: '' },
          { platilloId: 10, cantidad: 1 },
        ]),
        mesero,
      );

      expect(repository.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({ nota: null }),
            expect.objectContaining({ nota: null }),
          ],
        }),
      );
    });

    it('responde 403 si el mesero no tiene sucursal', async () => {
      const sinSucursal = { id: 'm', sucursalId: null } as unknown as User;

      await expect(service.crear(dto, sinSucursal)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.buscarMesa).not.toHaveBeenCalled();
    });

    it('responde 404 si la mesa no existe', async () => {
      repository.buscarMesa.mockResolvedValue(null);

      const promesa = service.crear(dto, mesero);

      await expect(promesa).rejects.toBeInstanceOf(NotFoundException);
      await expect(promesa).rejects.toThrow('La mesa no existe.');
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('responde 403 si la mesa es de otra sucursal', async () => {
      repository.buscarMesa.mockResolvedValue(mesa({ sucursalId: 2 }));

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('responde 422 si la mesa está fuera de servicio', async () => {
      repository.buscarMesa.mockResolvedValue(mesa({ activa: false }));

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('responde 409 si la mesa ya tiene un pedido abierto', async () => {
      preparar();
      repository.buscarPedidoAbierto.mockResolvedValue({ id: 99 });

      const promesa = service.crear(dto, mesero);

      await expect(promesa).rejects.toBeInstanceOf(ConflictException);
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('responde 404 si un platillo no existe', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([]);

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('responde 422 si el platillo está deshabilitado', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([
        platillo({ activo: false }),
      ]);

      const promesa = service.crear(dto, mesero);

      await expect(promesa).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(promesa).rejects.toThrow(
        'El platillo "Pupusa revuelta" no está disponible.',
      );
    });

    it('responde 422 si la categoría del platillo está deshabilitada', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([
        platillo({ categoria: { activa: false } }),
      ]);

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('responde 422 si el platillo no se vende en la sucursal', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([
        platillo({ sucursales: [] }),
      ]);

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('responde 422 si la cantidad supera la disponibilidad', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([
        platillo({
          sucursales: [
            { precio: new Prisma.Decimal('3.5'), disponibilidad: 2 },
          ],
        }),
      ]);

      const promesa = service.crear(dto, mesero);

      await expect(promesa).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(promesa).rejects.toThrow(
        'No hay disponibilidad suficiente de "Pupusa revuelta".',
      );
      expect(repository.crear).not.toHaveBeenCalled();
    });

    it('suma las cantidades del mismo platillo repetido en varias líneas', async () => {
      preparar();
      repository.buscarPlatillos.mockResolvedValue([
        platillo({
          sucursales: [
            { precio: new Prisma.Decimal('3.5'), disponibilidad: 5 },
          ],
        }),
      ]);

      await expect(
        service.crear(
          pedido([
            { platilloId: 10, cantidad: 3 },
            { platilloId: 10, cantidad: 3 },
          ]),
          mesero,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('responde 422 si la disponibilidad se agota durante la transacción', async () => {
      preparar();
      repository.crear.mockRejectedValue(new DisponibilidadInsuficienteError(10));

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('responde 409 si otra solicitud abrió un pedido en la mesa a la vez', async () => {
      preparar();
      repository.crear.mockRejectedValue(errorPrisma('P2002'));

      await expect(service.crear(dto, mesero)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('relanza los errores desconocidos sin traducirlos', async () => {
      preparar();
      const inesperado = new Error('falló la conexión');
      repository.crear.mockRejectedValue(inesperado);

      await expect(service.crear(dto, mesero)).rejects.toBe(inesperado);
    });
  });
});