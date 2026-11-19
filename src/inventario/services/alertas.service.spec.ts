import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AlertasInsumoRepository } from '@Inventario/repositories';
import { AlertasService } from '@Inventario/services';
import type { PrismaService } from '@Prisma/services';
import {
  EstadoAlerta,
  Prisma,
  Rol,
  UnidadInsumo,
  type User,
} from '@PrismaClient';

const gerente = { id: 'g-1', rol: Rol.GERENTE, sucursalId: 1 } as User;
const creadaEn = new Date('2026-11-18T14:05:00.000Z');

function alerta(estado: EstadoAlerta = EstadoAlerta.ACTIVA) {
  return {
    id: 9,
    insumoId: 5,
    cantidad: new Prisma.Decimal(18),
    minimo: new Prisma.Decimal(20),
    estado,
    creadaEn,
    insumo: { nombre: 'Masa de maíz', unidad: UnidadInsumo.LB },
  };
}

describe('AlertasService', () => {
  const findMany = vi.fn();
  const queryRaw = vi.fn();
  const update = vi.fn();
  const findUniqueOrThrow = vi.fn();
  let service: AlertasService;

  beforeEach(() => {
    vi.resetAllMocks();
    findMany.mockResolvedValue([]);
    update.mockResolvedValue(alerta(EstadoAlerta.VISTA));
    findUniqueOrThrow.mockResolvedValue(alerta(EstadoAlerta.VISTA));
    const tx = {
      $queryRaw: queryRaw,
      alertaInsumo: { update, findUniqueOrThrow },
    };
    const prisma = {
      alertaInsumo: { findMany },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;
    service = new AlertasService(new AlertasInsumoRepository(prisma));
  });

  describe('listar', () => {
    it('solo pide alertas ACTIVA y VISTA de la sucursal del usuario, las más recientes primero', async () => {
      await service.listar({ ...gerente, sucursalId: 4 });

      const { where, orderBy } = findMany.mock.calls[0][0];
      expect(where).toEqual({
        sucursalId: 4,
        estado: { in: [EstadoAlerta.ACTIVA, EstadoAlerta.VISTA] },
      });
      expect(orderBy).toEqual([{ creadaEn: 'desc' }, { id: 'desc' }]);
    });

    it('arma cada alerta con el insumo, la unidad en minúsculas y la fecha ISO', async () => {
      findMany.mockResolvedValue([alerta()]);

      await expect(service.listar(gerente)).resolves.toEqual([
        {
          id: 9,
          insumoId: 5,
          insumo: 'Masa de maíz',
          cantidad: 18,
          minimo: 20,
          unidad: 'lb',
          estado: EstadoAlerta.ACTIVA,
          creadaEn: '2026-11-18T14:05:00.000Z',
        },
      ]);
    });

    it('responde 403 si el usuario no tiene sucursal', async () => {
      await expect(service.listar({ ...gerente, sucursalId: null })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('marcarVista', () => {
    it('pasa una alerta ACTIVA a VISTA y guarda la hora', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, estado: EstadoAlerta.ACTIVA }]);

      await expect(service.marcarVista(9, gerente)).resolves.toMatchObject({
        id: 9,
        estado: EstadoAlerta.VISTA,
      });
      const { where, data } = update.mock.calls[0][0];
      expect(where).toEqual({ id: 9 });
      expect(data.estado).toBe(EstadoAlerta.VISTA);
      expect(data.vistaEn).toBeInstanceOf(Date);
      expect((queryRaw.mock.calls[0][0] as Prisma.Sql).sql).toMatch(/FOR UPDATE/);
    });

    it('si ya está VISTA responde sin cambios', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, estado: EstadoAlerta.VISTA }]);

      await expect(service.marcarVista(9, gerente)).resolves.toMatchObject({
        estado: EstadoAlerta.VISTA,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('responde 409 si la alerta ya está resuelta', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, estado: EstadoAlerta.RESUELTA }]);

      await expect(service.marcarVista(9, gerente)).rejects.toBeInstanceOf(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });

    it('responde 403 si la alerta es de otra sucursal', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 2, estado: EstadoAlerta.ACTIVA }]);

      await expect(service.marcarVista(9, gerente)).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('responde 404 si la alerta no existe', async () => {
      queryRaw.mockResolvedValue([]);

      await expect(service.marcarVista(9, gerente)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 404 sin consultar si el id está fuera del rango de INTEGER', async () => {
      await expect(service.marcarVista(2_147_483_648, gerente)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('responde 403 si el usuario no tiene sucursal', async () => {
      await expect(
        service.marcarVista(9, { ...gerente, sucursalId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
