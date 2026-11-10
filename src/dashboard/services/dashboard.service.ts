import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DashboardRepository,
  type FilaVentasHora,
} from '@Dashboard/repositories';
import type {
  DashboardVentasQueryDto,
  DashboardVentasResponseDto,
  FranjaHorariaDto,
} from '@Dashboard/dto';


const DESFASE_EL_SALVADOR = '-06:00';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

type Horario = { sucursalId: number; apertura: Date; cierre: Date };

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async ventas({
    desde,
    hasta,
    sucursalId,
    diaSemana,
  }: DashboardVentasQueryDto): Promise<DashboardVentasResponseDto> {
    // Criterio 7: un rango con la fecha final anterior a la inicial no es válido.
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


    const filtro = {
      inicio: new Date(`${desde}T00:00:00${DESFASE_EL_SALVADOR}`),
      fin: new Date(
        new Date(`${hasta}T00:00:00${DESFASE_EL_SALVADOR}`).getTime() +
          UN_DIA_MS,
      ),
      sucursalId,
    };

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
}


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
