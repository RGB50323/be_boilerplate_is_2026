import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import {
  EstadoBeneficio,
  type CrearBeneficioDto,
  type EditarBeneficioDto,
  type ListarBeneficiosDto,
} from '../dto/beneficio.dto.js';
import {
  BeneficiosRepository,
  type BeneficioConPlatillo,
} from '../repositories/beneficios.repository.js';
import { diaLocal, limiteVigencia, ultimoDiaIncluido } from './vigencia.js';

function beneficioEncontrado(
  beneficio: BeneficioConPlatillo | null,
): BeneficioConPlatillo {
  if (!beneficio) throw new NotFoundException('El beneficio no existe.');
  return beneficio;
}

function beneficioEditable(
  beneficio: BeneficioConPlatillo | null,
): BeneficioConPlatillo {
  const actual = beneficioEncontrado(beneficio);
  if (actual.deshabilitadoEn)
    throw new ConflictException('El beneficio ya está deshabilitado.');
  return actual;
}

function validarVigencia(desde: Date, hasta: Date) {
  if (desde >= hasta) {
    const mensaje = 'La fecha final no puede ser anterior a la inicial.';
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: [mensaje],
      errores: { vigenteHasta: mensaje },
    });
  }
}

function estadoDe(
  beneficio: BeneficioConPlatillo,
  ahora: Date,
): EstadoBeneficio {
  if (beneficio.deshabilitadoEn) return EstadoBeneficio.DESHABILITADO;
  if (!beneficio.platillo) return EstadoBeneficio.SIN_PLATILLO;
  if (beneficio.vigenteDesde > ahora) return EstadoBeneficio.PROGRAMADO;
  if (beneficio.vigenteHasta <= ahora) return EstadoBeneficio.VENCIDO;
  return EstadoBeneficio.VIGENTE;
}

function respuesta(beneficio: BeneficioConPlatillo, ahora = new Date()) {
  return {
    ...beneficio,
    nombre: beneficio.platillo?.nombre ?? null,
    descripcion: beneficio.platillo?.descripcion ?? null,
    vigenteDesde: diaLocal(beneficio.vigenteDesde),
    vigenteHasta: ultimoDiaIncluido(beneficio.vigenteHasta),
    estado: estadoDe(beneficio, ahora),
  };
}

@Injectable()
export class BeneficiosService {
  constructor(
    @Inject(BeneficiosRepository)
    private readonly repositorio: BeneficiosRepository,
  ) {}

  async listar(query: ListarBeneficiosDto) {
    const ahora = new Date();
    const pagina = await this.repositorio.listar(
      query.pagina,
      query.estado,
      ahora,
    );
    return {
      ...pagina,
      datos: pagina.datos.map((beneficio) => respuesta(beneficio, ahora)),
    };
  }

  listarPlatillos(pagina: number, buscar?: string) {
    return this.repositorio.listarPlatillos(pagina, buscar?.trim());
  }

  async obtener(id: number) {
    return respuesta(beneficioEncontrado(await this.repositorio.obtener(id)));
  }

  async crear(dto: CrearBeneficioDto) {
    const vigenteDesde = limiteVigencia(dto.vigenteDesde);
    const vigenteHasta = limiteVigencia(dto.vigenteHasta, true);
    validarVigencia(vigenteDesde, vigenteHasta);
    await this.verificarPlatillo(dto.platilloId);
    return this.escribir(() =>
      this.repositorio.crear({
        platilloId: dto.platilloId,
        costoPuntos: dto.costoPuntos,
        vigenteDesde,
        vigenteHasta,
      }),
    );
  }

  async editar(id: number, dto: EditarBeneficioDto) {
    const { platilloId, costoPuntos, vigenteDesde, vigenteHasta } = dto;
    if (
      platilloId === undefined &&
      costoPuntos === undefined &&
      vigenteDesde === undefined &&
      vigenteHasta === undefined
    ) {
      throw new BadRequestException('Indica al menos un campo editable.');
    }
    return this.escribir(() =>
      this.repositorio.modificar(id, (beneficio) => {
        const actual = beneficioEditable(beneficio);
        const desde =
          vigenteDesde === undefined
            ? actual.vigenteDesde
            : limiteVigencia(vigenteDesde);
        const hasta =
          vigenteHasta === undefined
            ? actual.vigenteHasta
            : limiteVigencia(vigenteHasta, true);
        validarVigencia(desde, hasta);
        return {
          platilloId,
          costoPuntos,
          vigenteDesde: desde,
          vigenteHasta: hasta,
          modificadoEn: new Date(),
        };
      }),
    );
  }

  deshabilitar(id: number) {
    return this.escribir(() =>
      this.repositorio.modificar(id, (beneficio) => {
        beneficioEditable(beneficio);
        const ahora = new Date();
        return { deshabilitadoEn: ahora, modificadoEn: ahora };
      }),
    );
  }

  private async verificarPlatillo(id: number) {
    if (!(await this.repositorio.existePlatillo(id))) {
      throw new NotFoundException('El platillo no existe.');
    }
  }

  private async escribir(operacion: () => Promise<BeneficioConPlatillo>) {
    try {
      return respuesta(await operacion());
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // La FK también cubre un borrado del platillo concurrente con la escritura.
        if (error.code === 'P2003')
          throw new NotFoundException('El platillo no existe.');
        if (error.code === 'P2025')
          throw new ConflictException('El beneficio ya no se puede modificar.');
      }
      throw error;
    }
  }
}
