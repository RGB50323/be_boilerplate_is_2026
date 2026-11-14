import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DashboardRepository } from '@Dashboard/repositories';
import {
  armarFranjas,
  DashboardService,
  generarCsvVentas,
} from './dashboard.service.js';

const hora = (valor: string) => new Date(`1970-01-01T${valor}:00Z`);

describe('DashboardService', () => {
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

describe('DashboardService.ventasDetalle y exportarVentasCsv', () => {
  const repo = {
    sucursalExiste: vi.fn().mockResolvedValue(true),
    ventasConfirmadasDetalle: vi.fn(),
    contarVentasConfirmadas: vi.fn(),
  };
  const service = new DashboardService(repo as unknown as DashboardRepository);
  const filtro = {
    inicio: new Date('2026-11-01T06:00:00Z'),
    fin: new Date('2026-11-09T06:00:00Z'),
    sucursalId: undefined,
  };

  beforeEach(() => {
    repo.ventasConfirmadasDetalle.mockReset().mockResolvedValue([venta]);
    repo.contarVentasConfirmadas.mockReset().mockResolvedValue(45);
  });

  it('pide la página con límite y desplazamiento, y devuelve el total', async () => {
    const r = await service.ventasDetalle({
      desde: '2026-11-01',
      hasta: '2026-11-08',
      pagina: 3,
      porPagina: 20,
    });
    expect(repo.ventasConfirmadasDetalle).toHaveBeenCalledWith(filtro, {
      limite: 20,
      desplazamiento: 40,
    });
    expect(r).toEqual({ items: [venta], total: 45, pagina: 3, porPagina: 20 });
  });

  it('rechaza un rango invertido sin consultar la lista', async () => {
    await expect(
      service.ventasDetalle({
        desde: '2026-11-08',
        hasta: '2026-11-01',
        pagina: 1,
        porPagina: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.ventasConfirmadasDetalle).not.toHaveBeenCalled();
  });

  it('exporta todas las ventas del periodo, sin paginar', async () => {
    const csv = await service.exportarVentasCsv({
      desde: '2026-11-01',
      hasta: '2026-11-08',
    });
    expect(repo.ventasConfirmadasDetalle).toHaveBeenCalledWith(filtro);
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});

const venta = {
  pedidoId: 15,
  numero: 'CEN-0015',
  sucursalId: 1,
  sucursal: 'Centro',
  fecha: '2026-11-08T18:05:00.000Z',
  tipo: 'MESA' as const,
  articulos: 3,
  subtotal: 25,
  descuentos: 2.5,
  venta: 22.5,
};

describe('generarCsvVentas', () => {
  it('una fila por venta, con fecha y hora de El Salvador', () => {
    const csv = generarCsvVentas([
      venta,
      {
        ...venta,
        pedidoId: 16,
        numero: null,
        sucursal: 'Plaza "Norte", local 3',
        fecha: '2026-11-09T02:35:00.000Z',
        tipo: 'LLEVAR',
        articulos: 1,
        subtotal: 8.99,
        descuentos: 0,
        venta: 8.99,
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Fecha,Hora,Pedido,Sucursal,Tipo,Artículos,Subtotal,Descuentos,Venta',
      '08/11/2026,12:05,CEN-0015,Centro,Mesa,3,25.00,2.50,22.50',
      '08/11/2026,20:35,#16,"Plaza ""Norte"", local 3",Para llevar,1,8.99,0.00,8.99',
    ]);
  });

  it('sin ventas solo tiene el encabezado', () => {
    expect(generarCsvVentas([])).toBe(
      'Fecha,Hora,Pedido,Sucursal,Tipo,Artículos,Subtotal,Descuentos,Venta',
    );
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
