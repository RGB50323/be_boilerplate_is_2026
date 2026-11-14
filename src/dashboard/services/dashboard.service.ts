import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DashboardRepository,
  type FilaVentaConfirmada,
  type FilaVentasHora,
  type FiltroVentas,
} from '@Dashboard/repositories';
import type {
  DashboardRangoQueryDto,
  DashboardVentasDetalleQueryDto,
  DashboardVentasQueryDto,
  DashboardVentasResponseDto,
  FranjaHorariaDto,
  VentasDetalleResponseDto,
} from '@Dashboard/dto';

// America/El_Salvador usa UTC-06:00.
const DESFASE_EL_SALVADOR = '-06:00';
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const DESFASE_MS = 6 * 60 * 60 * 1000;

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

    const [sucursales, platillos, ventasHora, horarios] = await Promise.all([
      this.dashboardRepository.ventasPorSucursal(filtro),
      this.dashboardRepository.platillosVendidos(filtro),
      this.dashboardRepository.ventasPorHora(filtro, diaSemana),
      this.dashboardRepository.horarios(sucursalId, diaSemana),
    ]);

    return {
      desde,
      hasta,
      sucursales,
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

  /** CSV con cada venta confirmada del periodo (botón "Exportar CSV"). */
  async exportarVentasCsv(rango: DashboardRangoQueryDto): Promise<string> {
    const filtro = await this.prepararFiltro(rango);
    return generarCsvVentas(
      await this.dashboardRepository.ventasConfirmadasDetalle(filtro),
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

const TIPOS_PEDIDO: Record<string, string> = {
  MESA: 'Mesa',
  LLEVAR: 'Para llevar',
};

const ENCABEZADO_CSV = [
  'Fecha',
  'Hora',
  'Pedido',
  'Sucursal',
  'Tipo',
  'Artículos',
  'Subtotal',
  'Descuentos',
  'Venta',
];

const dos = (n: number) => String(n).padStart(2, '0');

function celdaCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Mismo formato que genera el frontend: fecha dd/mm/aaaa y hora HH:mm en hora
 * de El Salvador, montos con dos decimales y punto, filas separadas por CRLF.
 */
export function generarCsvVentas(ventas: FilaVentaConfirmada[]): string {
  const filas = ventas.map((v) => {
    const local = new Date(new Date(v.fecha).getTime() - DESFASE_MS);
    return [
      `${dos(local.getUTCDate())}/${dos(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`,
      `${dos(local.getUTCHours())}:${dos(local.getUTCMinutes())}`,
      v.numero ?? `#${v.pedidoId}`,
      v.sucursal,
      TIPOS_PEDIDO[v.tipo] ?? v.tipo,
      v.articulos,
      v.subtotal.toFixed(2),
      v.descuentos.toFixed(2),
      v.venta.toFixed(2),
    ];
  });
  return [ENCABEZADO_CSV, ...filas]
    .map((fila) => fila.map(celdaCsv).join(','))
    .join('\r\n');
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
