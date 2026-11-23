import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, Rol, type User } from '@PrismaClient';
import { ROLES_KEY } from '@Auth/decorators';
import { DashboardController } from '@Dashboard/controllers';
import { DashboardRepository } from '@Dashboard/repositories';
import { PrismaService } from '@Prisma/services';
import { DashboardService, ticketPromedio } from './dashboard.service.js';

// Suite de componente de la historia H28 (plan de pruebas)
const hora = (valor: string) => new Date(`1970-01-01T${valor}:00Z`);

// Reconstruye el texto de una consulta Prisma.sql 
function textoSql(strings: readonly string[], valores: unknown[]): string {
  return strings.reduce((sql, parte, i) => {
    const valor = valores[i - 1];
    const intermedio =
      valor instanceof Prisma.Sql ? textoSql(valor.strings, valor.values) : '?';
    return sql + intermedio + parte;
  });
}

describe('H28. Dashboard de ventas por sucursal', () => {
  const repo = {
    sucursalExiste: vi.fn(),
    ventasPorSucursal: vi.fn(),
    platillosVendidos: vi.fn(),
    ventasPorHora: vi.fn(),
    horarios: vi.fn(),
    ventasConfirmadasDetalle: vi.fn(),
    contarVentasConfirmadas: vi.fn(),
  };
  let service: DashboardService;
  const periodo = { desde: '2026-11-01', hasta: '2026-11-08' };

  beforeEach(() => {
    repo.sucursalExiste.mockReset().mockResolvedValue(true);
    repo.ventasPorSucursal.mockReset().mockResolvedValue([]);
    repo.platillosVendidos.mockReset().mockResolvedValue([]);
    repo.ventasPorHora.mockReset().mockResolvedValue([]);
    repo.horarios.mockReset().mockResolvedValue([]);
    repo.ventasConfirmadasDetalle.mockReset().mockResolvedValue([]);
    repo.contarVentasConfirmadas.mockReset().mockResolvedValue(0);
    service = new DashboardService(repo as unknown as DashboardRepository);
  });

  it('AC1: devuelve el total general y, por sucursal, las ventas, los pedidos y el ticket promedio', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 1, nombre: 'Centro', ventas: 8120, pedidos: 640 },
      { sucursalId: 2, nombre: 'Escalón', ventas: 4310.25, pedidos: 330 },
    ]);

    const r = await service.ventas(periodo);

    expect(r.sucursales).toEqual([
      {
        sucursalId: 1,
        nombre: 'Centro',
        ventas: 8120,
        pedidos: 640,
        ticketPromedio: 12.69,
      },
      {
        sucursalId: 2,
        nombre: 'Escalón',
        ventas: 4310.25,
        pedidos: 330,
        ticketPromedio: 13.06,
      },
    ]);
    expect(r.totalGeneral).toEqual({
      ventas: 12430.25,
      pedidos: 970,
      ticketPromedio: 12.81,
    });
  });

  it('AC2: solo cuenta la vista venta_confirmada (subtotal menos descuentos, pago confirmado) y excluye los pedidos reembolsados', async () => {
    const consultas: string[] = [];
    const prisma = {
      $queryRaw: vi.fn(
        (strings: TemplateStringsArray, ...valores: unknown[]) => {
          consultas.push(textoSql(strings, valores));
          return Promise.resolve([]);
        },
      ),
    };
    const repositorio = new DashboardRepository(
      prisma as unknown as PrismaService,
    );
    const filtro = {
      inicio: new Date('2026-11-01T06:00:00Z'),
      fin: new Date('2026-11-09T06:00:00Z'),
    };

    await repositorio.ventasPorSucursal(filtro);
    await repositorio.platillosVendidos(filtro);
    await repositorio.ventasPorHora(filtro);

    expect(consultas).toHaveLength(3);
    for (const sql of consultas) {
      expect(sql).toContain('FROM venta_confirmada v');
      expect(sql).toContain('v.monto_neto');
      expect(sql).toMatch(
        /NOT EXISTS \(\s*SELECT 1 FROM pago r\s*WHERE r\.pedido_id = v\.pedido_id AND r\.estado = 'REEMBOLSADO'/,
      );
    }
  });

  it('AC3: el ticket promedio es ventas entre pedidos, redondeado a dos decimales ($8,120.00 / 640 = $12.69)', () => {
    expect(ticketPromedio(8120, 640)).toBe(12.69);
    expect(ticketPromedio(100, 3)).toBe(33.33);
  });

  it('AC4: una sucursal sin pedidos tiene ticket promedio $0.00', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 2, nombre: 'Escalón', ventas: 0, pedidos: 0 },
    ]);
    const r = await service.ventas(periodo);
    expect(ticketPromedio(0, 0)).toBe(0);
    expect(r.sucursales[0].ticketPromedio).toBe(0);
  });

  it('AC5: consulta exactamente el periodo pedido, como días completos en hora de El Salvador', async () => {
    await service.ventas(periodo);
    const filtro = {
      inicio: new Date('2026-11-01T06:00:00Z'),
      fin: new Date('2026-11-09T06:00:00Z'),
    };
    expect(repo.ventasPorSucursal).toHaveBeenCalledWith(filtro);
    expect(repo.platillosVendidos).toHaveBeenCalledWith(filtro);
    expect(repo.ventasPorHora).toHaveBeenCalledWith(filtro, undefined);
  });

  it('AC6: con una sucursal elegida, los indicadores, el ranking y los horarios se calculan solo para ella', async () => {
    await service.ventas({ ...periodo, sucursalId: 2 });
    const filtro = expect.objectContaining({ sucursalId: 2 });
    expect(repo.ventasPorSucursal).toHaveBeenCalledWith(filtro);
    expect(repo.platillosVendidos).toHaveBeenCalledWith(filtro);
    expect(repo.ventasPorHora).toHaveBeenCalledWith(filtro, undefined);
    expect(repo.horarios).toHaveBeenCalledWith(2, undefined);
  });

  it('AC7: rechaza un rango con fecha final anterior a la inicial sin consultar la base', async () => {
    await expect(
      service.ventas({ desde: '2026-11-08', hasta: '2026-11-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  });

  it('AC8: el ranking de platillos se ordena de mayor a menor cantidad e incluye cantidad y monto', async () => {
    const consultas: string[] = [];
    const prisma = {
      $queryRaw: vi.fn(
        (strings: TemplateStringsArray, ...valores: unknown[]) => {
          consultas.push(textoSql(strings, valores));
          return Promise.resolve([]);
        },
      ),
    };
    await new DashboardRepository(
      prisma as unknown as PrismaService,
    ).platillosVendidos({
      inicio: new Date('2026-11-01T06:00:00Z'),
      fin: new Date('2026-11-09T06:00:00Z'),
    });
    expect(consultas[0]).toContain('AS "cantidad"');
    expect(consultas[0]).toContain('AS "monto"');
    expect(consultas[0]).toMatch(/ORDER BY "cantidad" DESC/);
  });

  it('AC9: en un empate de cantidad, aparece primero el platillo que generó más dinero', async () => {
    const consultas: string[] = [];
    const prisma = {
      $queryRaw: vi.fn(
        (strings: TemplateStringsArray, ...valores: unknown[]) => {
          consultas.push(textoSql(strings, valores));
          return Promise.resolve([]);
        },
      ),
    };
    await new DashboardRepository(
      prisma as unknown as PrismaService,
    ).platillosVendidos({
      inicio: new Date('2026-11-01T06:00:00Z'),
      fin: new Date('2026-11-09T06:00:00Z'),
    });
    expect(consultas[0]).toMatch(/ORDER BY "cantidad" DESC, "monto" DESC/);
  });

  it('AC10: arma franjas de 1 hora por sucursal, con las ventas de cada franja', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 1, nombre: 'Centro', ventas: 1300, pedidos: 10 },
    ]);
    repo.ventasPorHora.mockResolvedValue([
      { sucursalId: 1, hora: 12, ventas: 900 },
      { sucursalId: 1, hora: 13, ventas: 400 },
    ]);
    repo.horarios.mockResolvedValue([
      { sucursalId: 1, apertura: hora('11:00'), cierre: hora('14:00') },
    ]);

    const r = await service.ventas(periodo);

    expect(r.horariosPico).toEqual([
      {
        sucursalId: 1,
        nombre: 'Centro',
        franjas: [
          { hora: 11, ventas: 0 },
          { hora: 12, ventas: 900 },
          { hora: 13, ventas: 400 },
        ],
      },
    ]);
  });

  it('AC11: devuelve las franjas en orden de hora para que, en un empate, se prefiera la más temprana', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 1, nombre: 'Centro', ventas: 1200, pedidos: 10 },
    ]);
    repo.ventasPorHora.mockResolvedValue([
      { sucursalId: 1, hora: 20, ventas: 400 },
      { sucursalId: 1, hora: 13, ventas: 400 },
      { sucursalId: 1, hora: 19, ventas: 400 },
    ]);
    repo.horarios.mockResolvedValue([
      { sucursalId: 1, apertura: hora('13:00'), cierre: hora('21:00') },
    ]);

    const r = await service.ventas(periodo);
    const horas = r.horariosPico[0].franjas.map((f) => f.hora);

    expect(horas).toEqual([...horas].sort((a, b) => a - b));
  });

  it('AC12: el filtro por día de la semana solo afecta a los horarios pico', async () => {
    await service.ventas({ ...periodo, diaSemana: 5 });
    expect(repo.ventasPorHora).toHaveBeenCalledWith(expect.anything(), 5);
    expect(repo.horarios).toHaveBeenCalledWith(undefined, 5);
    expect(repo.ventasPorSucursal).toHaveBeenCalledWith(
      expect.not.objectContaining({ diaSemana: expect.anything() }),
    );
  });

  it('AC13: un periodo sin ventas responde un total de $0.00 y ningún platillo', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 1, nombre: 'Centro', ventas: 0, pedidos: 0 },
    ]);
    const r = await service.ventas(periodo);
    expect(r.totalGeneral).toEqual({
      ventas: 0,
      pedidos: 0,
      ticketPromedio: 0,
    });
    expect(r.platillos).toEqual([]);
  });

  it('AC14: exporta un CSV con una fila por sucursal y el total general del periodo', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 1, nombre: 'Centro', ventas: 8120, pedidos: 640 },
      { sucursalId: 2, nombre: 'Escalón', ventas: 4310.25, pedidos: 330 },
    ]);

    const csv = await service.exportarVentasPorSucursalCsv(periodo);

    expect(csv.split('\r\n')).toEqual([
      'Sucursal,Ventas,Pedidos,Ticket promedio',
      'Centro,8120.00,640,12.69',
      'Escalón,4310.25,330,13.06',
      'Total general,12430.25,970,12.81',
    ]);
  });

  it('AC15: solo el gerente general (y el gerente, limitado a su sucursal) tiene acceso; los demás roles no', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, DashboardController) as Rol[];
    expect(roles).toEqual([Rol.GERENTE_GENERAL, Rol.GERENTE]);
    for (const rol of [Rol.CLIENTE, Rol.MESERO, Rol.COCINA]) {
      expect(roles).not.toContain(rol);
    }

    const gerente = { rol: Rol.GERENTE, sucursalId: 1 } as User;
    expect(() =>
      service.limitarAlcance({ ...periodo, sucursalId: 2 }, gerente),
    ).toThrow(ForbiddenException);
  });
});
