import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InsumosRepository } from '@Inventario/repositories';
import { EvaluadorAlertasInventario, InventarioService } from '@Inventario/services';
import type { PrismaService } from '@Prisma/services';
import {
  Prisma,
  Rol,
  TipoMovimientoInsumo,
  UnidadInsumo,
  type User,
} from '@PrismaClient';

const gerente = { id: 'g-1', rol: Rol.GERENTE, sucursalId: 1 } as User;
const d = (valor: number | string) => new Prisma.Decimal(valor);

function insumo(cantidad: number, minimo: number) {
  return { id: 5, nombre: 'Queso con loroco', unidad: UnidadInsumo.LB, cantidad: d(cantidad), minimo: d(minimo) };
}

describe('InventarioService', () => {
  const findMany = vi.fn();
  const create = vi.fn();
  const findUnique = vi.fn();
  const count = vi.fn();
  const movimientosFindMany = vi.fn();
  const queryRaw = vi.fn();
  const update = vi.fn();
  const movimientoCreate = vi.fn();
  const evaluar = vi.fn();
  let service: InventarioService;

  beforeEach(() => {
    vi.resetAllMocks();
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});
    movimientoCreate.mockResolvedValue({ id: 88 });
    evaluar.mockResolvedValue(undefined);
    const tx = {
      $queryRaw: queryRaw,
      insumo: { update },
      movimientoInsumo: { create: movimientoCreate },
    };
    const prisma = {
      insumo: { findMany, create, findUnique },
      movimientoInsumo: { count, findMany: movimientosFindMany },
      $transaction: (arg: unknown) =>
        typeof arg === 'function' ? arg(tx) : Promise.all(arg as Promise<unknown>[]),
    } as unknown as PrismaService;
    service = new InventarioService(new InsumosRepository(prisma), {
      evaluar,
    } as unknown as EvaluadorAlertasInventario);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listar', () => {
    it('solo consulta los insumos de la sucursal del usuario', async () => {
      await service.listar({ ...gerente, sucursalId: 4 });

      expect(findMany.mock.calls[0][0].where).toEqual({ sucursalId: 4, nombre: undefined });
    });

    it('filtra por parte del nombre sin distinguir mayúsculas', async () => {
      await service.listar(gerente, 'queso');

      expect(findMany.mock.calls[0][0].where.nombre).toEqual({
        contains: 'queso',
        mode: 'insensitive',
      });
    });

    it('calcula el estado de cada insumo y devuelve números y unidad en minúsculas', async () => {
      findMany.mockResolvedValue([insumo(12.5, 10), { ...insumo(10, 10), id: 6 }, { ...insumo(3, 10), id: 7 }]);

      const respuesta = await service.listar(gerente);

      expect(respuesta[0]).toEqual({
        id: 5,
        nombre: 'Queso con loroco',
        unidad: 'lb',
        cantidad: 12.5,
        minimo: 10,
        estado: 'NORMAL',
      });
      expect(respuesta.map((i) => i.estado)).toEqual(['NORMAL', 'BAJO', 'BAJO']);
    });

    it('responde 403 si el usuario no tiene sucursal', async () => {
      await expect(service.listar({ ...gerente, sucursalId: null })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('crear', () => {
    const dto = { nombre: 'Masa de maíz', unidad: 'lb' as const, minimo: 20 };

    it('crea el insumo en la sucursal del usuario con cantidad inicial 0', async () => {
      create.mockResolvedValue({ ...insumo(0, 20), nombre: 'Masa de maíz' });

      const respuesta = await service.crear(gerente, dto);

      expect(create.mock.calls[0][0].data).toEqual({
        sucursalId: 1,
        nombre: 'Masa de maíz',
        unidad: UnidadInsumo.LB,
        minimo: 20,
      });
      expect(respuesta).toMatchObject({ cantidad: 0, minimo: 20, estado: 'BAJO' });
    });

    it('responde 409 si el nombre ya existe en la sucursal', async () => {
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(service.crear(gerente, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 403 si el usuario no tiene sucursal', async () => {
      await expect(service.crear({ ...gerente, sucursalId: null }, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('registrarMovimiento', () => {
    const salida = { tipo: TipoMovimientoInsumo.SALIDA, cantidad: 3, motivo: 'Uso en cocina' };
    const entrada = { tipo: TipoMovimientoInsumo.ENTRADA, cantidad: 0.1, motivo: 'Compra' };

    it('una salida descuenta la cantidad y guarda el movimiento con usuario y motivo', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '12.500' }]);

      await expect(service.registrarMovimiento(5, gerente, salida)).resolves.toEqual({
        movimientoId: 88,
        cantidadAnterior: 12.5,
        cantidadActual: 9.5,
      });
      expect(update.mock.calls[0][0].data.cantidad.toString()).toBe('9.5');
      const data = movimientoCreate.mock.calls[0][0].data;
      expect(data).toMatchObject({ insumoId: 5, tipo: 'SALIDA', motivo: 'Uso en cocina', usuarioId: 'g-1' });
      expect([data.cantidad, data.cantidadAnterior, data.cantidadActual].map(String)).toEqual([
        '3',
        '12.5',
        '9.5',
      ]);
    });

    it('una entrada suma sin errores de redondeo', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '0.200' }]);

      await expect(service.registrarMovimiento(5, gerente, entrada)).resolves.toMatchObject({
        cantidadAnterior: 0.2,
        cantidadActual: 0.3,
      });
    });

    it('una salida igual a la existencia deja la cantidad en 0', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '3.000' }]);

      await expect(service.registrarMovimiento(5, gerente, salida)).resolves.toMatchObject({
        cantidadActual: 0,
      });
    });

    it('una salida mayor a la existencia responde 422 y no cambia nada', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '2.999' }]);

      await expect(service.registrarMovimiento(5, gerente, salida)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(update).not.toHaveBeenCalled();
      expect(movimientoCreate).not.toHaveBeenCalled();
      expect(evaluar).not.toHaveBeenCalled();
    });

    it('una entrada que supera el máximo responde 422', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '999999999.999' }]);

      await expect(service.registrarMovimiento(5, gerente, entrada)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('bloquea la fila del insumo antes de leer la cantidad', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '12.500' }]);

      await service.registrarMovimiento(5, gerente, salida);

      expect((queryRaw.mock.calls[0][0] as Prisma.Sql).sql).toMatch(/FOR UPDATE/);
    });

    it('responde 404 si el insumo no existe', async () => {
      queryRaw.mockResolvedValue([]);

      await expect(service.registrarMovimiento(5, gerente, salida)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('responde 404 sin consultar si el id está fuera del rango de INTEGER', async () => {
      await expect(
        service.registrarMovimiento(2_147_483_648, gerente, salida),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('responde 403 si el insumo es de otra sucursal', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 2, cantidad: '12.500' }]);

      await expect(service.registrarMovimiento(5, gerente, salida)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('evalúa las alertas del insumo después de guardar el movimiento', async () => {
      const orden: string[] = [];
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '12.500' }]);
      movimientoCreate.mockImplementation(async () => {
        orden.push('movimiento');
        return { id: 88 };
      });
      evaluar.mockImplementation(async () => {
        orden.push('alertas');
      });

      await service.registrarMovimiento(5, gerente, salida);

      expect(evaluar).toHaveBeenCalledWith(5);
      expect(orden).toEqual(['movimiento', 'alertas']);
    });

    it('si falla la evaluación de alertas igual responde: el movimiento ya se guardó', async () => {
      queryRaw.mockResolvedValue([{ sucursalId: 1, cantidad: '12.500' }]);
      evaluar.mockRejectedValue(new Error('falló'));
      const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.registrarMovimiento(5, gerente, salida)).resolves.toMatchObject({
        cantidadActual: 9.5,
      });
      expect(logError).toHaveBeenCalled();
    });
  });

  describe('historial', () => {
    it('devuelve los movimientos paginados del más reciente al más antiguo', async () => {
      findUnique.mockResolvedValue({ sucursalId: 1 });
      count.mockResolvedValue(11);
      movimientosFindMany.mockResolvedValue([
        {
          id: 90,
          tipo: TipoMovimientoInsumo.SALIDA,
          cantidad: d(3),
          motivo: 'Uso en cocina',
          creadoEn: new Date('2026-11-17T20:05:00.000Z'),
          usuario: { nombre: 'Ana', apellido: 'López', email: 'ana@example.com' },
        },
        {
          id: 89,
          tipo: TipoMovimientoInsumo.ENTRADA,
          cantidad: d(10),
          motivo: 'Compra',
          creadoEn: new Date('2026-11-17T05:30:00.000Z'),
          usuario: { nombre: null, apellido: null, email: 'g@example.com' },
        },
      ]);

      const respuesta = await service.historial(5, gerente, 2);

      const args = movimientosFindMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([{ creadoEn: 'desc' }, { id: 'desc' }]);
      expect(args).toMatchObject({ where: { insumoId: 5 }, skip: 10, take: 10 });
      expect(respuesta).toEqual({
        pagina: 2,
        totalPaginas: 2,
        total: 11,
        datos: [
          { id: 90, fecha: '2026-11-17', hora: '14:05', usuario: 'Ana López', tipo: 'SALIDA', cantidad: 3, motivo: 'Uso en cocina' },
          { id: 89, fecha: '2026-11-16', hora: '23:30', usuario: 'g@example.com', tipo: 'ENTRADA', cantidad: 10, motivo: 'Compra' },
        ],
      });
    });

    it('responde 404 si el insumo no existe', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.historial(5, gerente, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 403 si el insumo es de otra sucursal', async () => {
      findUnique.mockResolvedValue({ sucursalId: 2 });

      await expect(service.historial(5, gerente, 1)).rejects.toBeInstanceOf(ForbiddenException);
      expect(movimientosFindMany).not.toHaveBeenCalled();
    });
  });
});
