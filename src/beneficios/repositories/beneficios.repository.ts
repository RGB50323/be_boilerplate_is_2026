import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { paginar, saltoDePagina } from '@Common/paginacion';
import { EstadoBeneficio } from '../dto/beneficio.dto.js';

const POR_PAGINA = 10;
const platillo = {
  id: true,
  nombre: true,
  descripcion: true,
} satisfies Prisma.PlatilloSelect;
const incluirPlatillo = {
  platillo: { select: platillo },
} satisfies Prisma.BeneficioInclude;
export type BeneficioConPlatillo = Prisma.BeneficioGetPayload<{
  include: typeof incluirPlatillo;
}>;
type DatosBeneficio = Pick<
  BeneficioConPlatillo,
  'platilloId' | 'costoPuntos' | 'vigenteDesde' | 'vigenteHasta'
>;
type CambiosBeneficio = Partial<DatosBeneficio> & {
  modificadoEn?: Date;
  deshabilitadoEn?: Date;
};

function filtroEstado(
  estado: EstadoBeneficio | undefined,
  ahora: Date,
): Prisma.BeneficioWhereInput {
  if (estado === EstadoBeneficio.DESHABILITADO)
    return { deshabilitadoEn: { not: null } };
  if (estado === EstadoBeneficio.SIN_PLATILLO)
    return { deshabilitadoEn: null, platilloId: null };
  if (!estado) return {};

  const habilitado = { deshabilitadoEn: null, platilloId: { not: null } };
  if (estado === EstadoBeneficio.PROGRAMADO)
    return { ...habilitado, vigenteDesde: { gt: ahora } };
  if (estado === EstadoBeneficio.VENCIDO)
    return { ...habilitado, vigenteHasta: { lte: ahora } };
  return {
    ...habilitado,
    vigenteDesde: { lte: ahora },
    vigenteHasta: { gt: ahora },
  };
}

@Injectable()
export class BeneficiosRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listar(
    pagina: number,
    estado: EstadoBeneficio | undefined,
    ahora: Date,
  ) {
    const where = filtroEstado(estado, ahora);
    const [datos, total] = await this.prisma.$transaction(
      [
        this.prisma.beneficio.findMany({
          where,
          include: incluirPlatillo,
          orderBy: { id: 'desc' },
          skip: saltoDePagina(pagina, POR_PAGINA),
          take: POR_PAGINA,
        }),
        this.prisma.beneficio.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return paginar(datos, total, pagina, POR_PAGINA);
  }

  async listarPlatillos(pagina: number, buscar?: string) {
    const where: Prisma.PlatilloWhereInput = buscar
      ? { nombre: { contains: buscar, mode: 'insensitive' } }
      : {};
    const [datos, total] = await this.prisma.$transaction(
      [
        this.prisma.platillo.findMany({
          where,
          select: platillo,
          orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
          skip: saltoDePagina(pagina, POR_PAGINA),
          take: POR_PAGINA,
        }),
        this.prisma.platillo.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return paginar(datos, total, pagina, POR_PAGINA);
  }

  obtener(id: number) {
    return this.prisma.beneficio.findUnique({
      where: { id },
      include: incluirPlatillo,
    });
  }

  crear(data: DatosBeneficio) {
    return this.prisma.beneficio.create({ data, include: incluirPlatillo });
  }

  modificar(
    id: number,
    preparar: (actual: BeneficioConPlatillo | null) => CambiosBeneficio,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const filas = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM beneficio WHERE id = ${id} FOR UPDATE
      `;
        const actual = filas.length
          ? await tx.beneficio.findUnique({
              where: { id },
              include: incluirPlatillo,
            })
          : null;
        const data = preparar(actual);
        return tx.beneficio.update({
          where: { id, deshabilitadoEn: null },
          data,
          include: incluirPlatillo,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async existePlatillo(id: number) {
    return (
      (await this.prisma.platillo.findUnique({
        where: { id },
        select: { id: true },
      })) !== null
    );
  }
}
