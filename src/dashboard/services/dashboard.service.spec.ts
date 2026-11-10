import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DashboardRepository } from '@Dashboard/repositories';
import { armarFranjas, DashboardService } from './dashboard.service.js';

const hora = (valor: string) => new Date(`1970-01-01T${valor}:00Z`);

describe('DashboardService', () => {
  const repo = {
    sucursalExiste: vi.fn(),
    ventasPorSucursal: vi.fn(),
    platillosVendidos: vi.fn(),
    ventasPorHora: vi.fn(),
    horarios: vi.fn(),
  };
  let service: DashboardService;

  beforeEach(() => {
    repo.sucursalExiste.mockReset().mockResolvedValue(true);
    repo.ventasPorSucursal.mockReset().mockResolvedValue([]);
    repo.platillosVendidos.mockReset().mockResolvedValue([]);
    repo.ventasPorHora.mockReset().mockResolvedValue([]);
    repo.horarios.mockReset().mockResolvedValue([]);
    service = new DashboardService(repo as unknown as DashboardRepository);
  });

  it('rechaza una fecha final anterior a la inicial sin consultar la base', async () => {
    const resultado = service.ventas({ desde: '2026-11-08', hasta: '2026-11-01' });
    await expect(resultado).rejects.toBeInstanceOf(BadRequestException);
    await expect(resultado).rejects.toMatchObject({
      response: {
        errores: {
          hasta:
            'Rango no válido: la fecha final no puede ser anterior a la inicial.',
        },
      },
    });
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  });

  it('acepta un rango de un solo día', async () => {
    await expect(
      service.ventas({ desde: '2026-11-08', hasta: '2026-11-08' }),
    ).resolves.toMatchObject({ desde: '2026-11-08', hasta: '2026-11-08' });
  });

  it('responde 404 si la sucursal no existe', async () => {
    repo.sucursalExiste.mockResolvedValue(false);
    await expect(
      service.ventas({ desde: '2026-11-01', hasta: '2026-11-08', sucursalId: 99 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.ventasPorSucursal).not.toHaveBeenCalled();
  });

  it('consulta días locales completos de El Salvador (UTC-6)', async () => {
    await service.ventas({
      desde: '2026-11-01',
      hasta: '2026-11-08',
      sucursalId: 2,
      diaSemana: 5,
    });

    const filtro = {
      inicio: new Date('2026-11-01T06:00:00Z'),
      fin: new Date('2026-11-09T06:00:00Z'),
      sucursalId: 2,
    };
    expect(repo.ventasPorSucursal).toHaveBeenCalledWith(filtro);
    expect(repo.platillosVendidos).toHaveBeenCalledWith(filtro);
    expect(repo.ventasPorHora).toHaveBeenCalledWith(filtro, 5);
    expect(repo.horarios).toHaveBeenCalledWith(2, 5);
  });

  it('arma los horarios pico de cada sucursal, incluso sin ventas', async () => {
    repo.ventasPorSucursal.mockResolvedValue([
      { sucursalId: 1, nombre: 'Centro', ventas: 8120, pedidos: 640 },
      { sucursalId: 2, nombre: 'Escalón', ventas: 0, pedidos: 0 },
    ]);
    repo.ventasPorHora.mockResolvedValue([
      { sucursalId: 1, hora: 12, ventas: 900 },
    ]);
    repo.horarios.mockResolvedValue([
      { sucursalId: 1, apertura: hora('11:00'), cierre: hora('14:00') },
      { sucursalId: 2, apertura: hora('12:00'), cierre: hora('13:00') },
    ]);

    const r = await service.ventas({ desde: '2026-11-01', hasta: '2026-11-08' });

    expect(r.sucursales).toHaveLength(2);
    expect(r.horariosPico).toEqual([
      {
        sucursalId: 1,
        nombre: 'Centro',
        franjas: [
          { hora: 11, ventas: 0 },
          { hora: 12, ventas: 900 },
          { hora: 13, ventas: 0 },
        ],
      },
      { sucursalId: 2, nombre: 'Escalón', franjas: [{ hora: 12, ventas: 0 }] },
    ]);
  });
});

describe('armarFranjas', () => {
  it('va de la primera apertura a la franja que empieza antes del último cierre', () => {
    const franjas = armarFranjas(
      [],
      [
        { sucursalId: 1, apertura: hora('08:00'), cierre: hora('21:00') },
        { sucursalId: 1, apertura: hora('08:00'), cierre: hora('23:00') },
      ],
    );
    expect(franjas[0]).toEqual({ hora: 8, ventas: 0 });
    expect(franjas.at(-1)).toEqual({ hora: 22, ventas: 0 });
    expect(franjas).toHaveLength(15);
  });

  it('incluye la franja de un cierre a media hora', () => {
    const franjas = armarFranjas(
      [],
      [{ sucursalId: 1, apertura: hora('10:00'), cierre: hora('12:30') }],
    );
    expect(franjas.map((f) => f.hora)).toEqual([10, 11, 12]);
  });

  it('agrega las horas con ventas fuera del horario', () => {
    const franjas = armarFranjas(
      [{ sucursalId: 1, hora: 7, ventas: 15 }],
      [{ sucursalId: 1, apertura: hora('08:00'), cierre: hora('10:00') }],
    );
    expect(franjas).toEqual([
      { hora: 7, ventas: 15 },
      { hora: 8, ventas: 0 },
      { hora: 9, ventas: 0 },
    ]);
  });

  it('sin horarios ni ventas no devuelve franjas', () => {
    expect(armarFranjas([], [])).toEqual([]);
  });
});
