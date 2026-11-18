import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DashboardRepository,
  type FilaVentasHora,
  type FilaVentasSucursal,
  type FiltroVentas,
} from '@Dashboard/repositories';
import type {
  DashboardRangoQueryDto,
  DashboardVentasDetalleQueryDto,
  DashboardVentasQueryDto,
  DashboardVentasResponseDto,
  FranjaHorariaDto,
  TotalGeneralDto,
  VentasDetalleResponseDto,
  VentasSucursalDto,
} from '@Dashboard/dto';

// America/El_Salvador usa UTC-06:00.
const DESFASE_EL_SALVADOR = '-06:00';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

type Horario = { sucursalId: number; apertura: Date; cierre: Date };

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async ventas({
    diaSemana,
    ...rango
  }: DashboardVentasQueryDto): Promise<DashboardVentasResponseDto> {
    const filtro = await this.prepararFiltro(rango);
    const { desde, hasta, sucursalId } = rango;

    const [filas, platillos, ventasHora, horarios] = await Promise.all([
      this.dashboardRepository.ventasPorSucursal(filtro),
      this.dashboardRepository.platillosVendidos(filtro),
      this.dashboardRepository.ventasPorHora(filtro, diaSemana),
      this.dashboardRepository.horarios(sucursalId, diaSemana),
    ]);

    const sucursales = conTicket(filas);

    return {
      desde,
      hasta,
      sucursales,
      totalGeneral: calcularTotalGeneral(filas),
      platillos,
      horariosPico: sucursales.map(({ sucursalId: id, nombre }) => ({
        sucursalId: id,
        nombre,
        franjas: armarFranjas(
          ventasHora.filter((v) => v.sucursalId === id),
          horarios.filter((h) => h.sucursalId === id),
        ),
      })),
    };
  }

  /** Lista paginada de ventas confirmadas (vista general, criterio 14). */
  async ventasDetalle({
    pagina,
    porPagina,
    ...rango
  }: DashboardVentasDetalleQueryDto): Promise<VentasDetalleResponseDto> {
    const filtro = await this.prepararFiltro(rango);
    const [items, total] = await Promise.all([
      this.dashboardRepository.ventasConfirmadasDetalle(filtro, {
        limite: porPagina,
        desplazamiento: (pagina - 1) * porPagina,
      }),
      this.dashboardRepository.contarVentasConfirmadas(filtro),
    ]);
    return { items, total, pagina, porPagina };
  }

  /**
   * CSV de ventas por sucursal (criterio 14): una fila por sucursal con
   * ventas, pedidos y ticket promedio, y el total general. Coincide con la
   * tabla "Ventas por sucursal" del dashboard y usa los mismos filtros.
   */
  async exportarVentasPorSucursalCsv(
    rango: DashboardRangoQueryDto,
  ): Promise<string> {
    const filtro = await this.prepararFiltro(rango);
    const filas = await this.dashboardRepository.ventasPorSucursal(filtro);
    return generarCsvVentasPorSucursal(
      conTicket(filas),
      calcularTotalGeneral(filas),
    );
  }

  /**
   * Valida el rango (criterio 7) y la sucursal, y lo traduce a días locales
   * completos de El Salvador: [desde 00:00, hasta + 1 día 00:00).
   */
  private async prepararFiltro({
    desde,
    hasta,
    sucursalId,
  }: DashboardRangoQueryDto): Promise<FiltroVentas> {
    if (hasta < desde) {
      const message =
        'Rango no válido: la fecha final no puede ser anterior a la inicial.';
      throw new BadRequestException({
        statusCode: 400,
        message,
        errores: { hasta: message },
      });
    }

    if (
      sucursalId !== undefined &&
      !(await this.dashboardRepository.sucursalExiste(sucursalId))
    ) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'La sucursal solicitada no existe.',
        errores: { sucursalId: 'La sucursal solicitada no existe.' },
      });
    }

    return {
      inicio: new Date(`${desde}T00:00:00${DESFASE_EL_SALVADOR}`),
      fin: new Date(
        new Date(`${hasta}T00:00:00${DESFASE_EL_SALVADOR}`).getTime() +
          UN_DIA_MS,
      ),
      sucursalId,
    };
  }
}



/**
 * Una franja por hora desde la primera apertura hasta el último cierre de la
 * sucursal, con 0 en las horas sin ventas. Si hubo ventas fuera de ese rango
 * (por ejemplo, un pago confirmado después del cierre) también se incluyen.
 */
export function armarFranjas(
  ventas: FilaVentasHora[],
  horarios: Horario[],
): FranjaHorariaDto[] {
  const horas = ventas.map((v) => v.hora);
  for (const { apertura, cierre } of horarios) {
    // Prisma representa TIME con un Date en UTC que conserva la hora local.
    horas.push(apertura.getUTCHours());
    // La última franja es la que empieza antes del cierre (cierre 21:00 → 20:00).
    const minutosCierre = cierre.getUTCHours() * 60 + cierre.getUTCMinutes();
    horas.push(Math.ceil(minutosCierre / 60) - 1);
  }
  if (!horas.length) return [];

  const ventasPorHora = new Map(ventas.map((v) => [v.hora, v.ventas]));
  const primera = Math.max(0, Math.min(...horas));
  const ultima = Math.min(23, Math.max(...horas));
  const franjas: FranjaHorariaDto[] = [];
  for (let hora = primera; hora <= ultima; hora++) {
    franjas.push({ hora, ventas: ventasPorHora.get(hora) ?? 0 });
  }
  return franjas;
}

const enCentavos = (n: number) => Math.round(n * 100);

/**
 * Criterios 3 y 4: ventas ÷ pedidos redondeado a dos decimales; 0 sin pedidos.
 * Se divide en centavos enteros para que el redondeo no dependa de los
 * decimales del float (8,120.00 ÷ 640 = 12.69).
 */
export function ticketPromedio(ventas: number, pedidos: number): number {
  if (pedidos <= 0) return 0;
  return Math.round(enCentavos(ventas) / pedidos) / 100;
}

function conTicket(filas: FilaVentasSucursal[]): VentasSucursalDto[] {
  return filas.map((f) => ({
    ...f,
    ticketPromedio: ticketPromedio(f.ventas, f.pedidos),
  }));
}

/** Totales de las sucursales incluidas; el ticket es el total ÷ pedidos totales. */
export function calcularTotalGeneral(
  filas: Pick<FilaVentasSucursal, 'ventas' | 'pedidos'>[],
): TotalGeneralDto {
  const centavos = filas.reduce((t, f) => t + enCentavos(f.ventas), 0);
  const pedidos = filas.reduce((t, f) => t + f.pedidos, 0);
  return {
    ventas: centavos / 100,
    pedidos,
    ticketPromedio: pedidos ? Math.round(centavos / pedidos) / 100 : 0,
  };
}

function celdaCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Mismo orden que la tabla del dashboard (mayor venta primero; en empate, por
 * nombre) y al final la fila "Total general". Montos con dos decimales y
 * punto; filas separadas por CRLF.
 */
export function generarCsvVentasPorSucursal(
  sucursales: VentasSucursalDto[],
  total: TotalGeneralDto,
): string {
  const fila = (nombre: string, t: TotalGeneralDto) => [
    nombre,
    t.ventas.toFixed(2),
    t.pedidos,
    t.ticketPromedio.toFixed(2),
  ];
  const ordenadas = [...sucursales].sort(
    (a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre, 'es'),
  );
  return [
    ['Sucursal', 'Ventas', 'Pedidos', 'Ticket promedio'],
    ...ordenadas.map((s) => fila(s.nombre, s)),
    fila('Total general', total),
  ]
    .map((f) => f.map(celdaCsv).join(','))
    .join('\r\n');
}
