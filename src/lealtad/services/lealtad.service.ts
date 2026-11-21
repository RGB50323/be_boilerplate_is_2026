import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoMovimientoPuntos } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { randomBytes } from 'node:crypto';
import type {
  AdquirirCuponDto,
  CrearBeneficioDto,
  EditarBeneficioDto,
} from '../dto/index.js';
import {
  bloquearCuenta,
  puntosPendientes,
  reglaVigente,
} from '../utils/puntos.js';

const ID_MAXIMO = 2_147_483_647;
const incluirBeneficio = {
  beneficio: { select: { id: true, nombre: true, vigenteHasta: true } },
} as const;

type CanjeConBeneficio = Prisma.CanjeGetPayload<{
  include: typeof incluirBeneficio;
}>;

export type EstadoCupon = 'PENDIENTE' | 'UTILIZADO' | 'EXPIRADO';

function vigencia(ahora: Date): Prisma.BeneficioWhereInput {
  return {
    activo: true,
    deshabilitadoEn: null,
    vigenteDesde: { lte: ahora },
    vigenteHasta: { gt: ahora },
  };
}

// El cupón vale hasta que se usa o hasta que termina la vigencia del beneficio
function datosCupon(canje: CanjeConBeneficio, ahora = new Date()) {
  const expiraEn = canje.beneficio.vigenteHasta;
  const estado: EstadoCupon = canje.utilizadoEn
    ? 'UTILIZADO'
    : expiraEn <= ahora
      ? 'EXPIRADO'
      : 'PENDIENTE';
  return {
    id: canje.id,
    codigo: canje.codigo,
    beneficio: { id: canje.beneficio.id, nombre: canje.beneficio.nombre },
    puntosUsados: canje.puntosUsados,
    creadoEn: canje.creadoEn,
    expiraEn,
    utilizadoEn: canje.utilizadoEn,
    estado,
  };
}

function validarCupon(canje: CanjeConBeneficio | null, ahora: Date) {
  if (!canje) throw new NotFoundException('El cupón no existe.');
  const cupon = datosCupon(canje, ahora);
  if (cupon.estado === 'UTILIZADO')
    throw new ConflictException('El cupón ya fue utilizado.');
  if (cupon.estado === 'EXPIRADO')
    throw new GoneException('El cupón ha expirado.');
  return cupon;
}

const diaEnElSalvador = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/El_Salvador',
});

function errorVigencia(
  campo: 'vigenteDesde' | 'vigenteHasta',
  mensaje: string,
) {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: [mensaje],
    errores: { [campo]: mensaje },
  });
}

function fechasBeneficio(
  desde: string | Date,
  hasta: string | Date,
  ahora: Date,
  inicioAnterior?: Date,
) {
  const vigenteDesde = new Date(desde);
  const vigenteHasta = new Date(hasta);
  if (!(vigenteHasta > vigenteDesde)) {
    throw errorVigencia(
      'vigenteHasta',
      'El fin de la vigencia debe ser posterior a su inicio.',
    );
  }
  if (
    vigenteDesde.getTime() !== inicioAnterior?.getTime() &&
    diaEnElSalvador.format(vigenteDesde) < diaEnElSalvador.format(ahora)
  ) {
    throw errorVigencia(
      'vigenteDesde',
      'La fecha de inicio no puede ser anterior a hoy en El Salvador.',
    );
  }
  return { vigenteDesde, vigenteHasta };
}

@Injectable()
export class LealtadService {
  constructor(private readonly prisma: PrismaService) {}

  puntos(clienteId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const cuenta = await tx.cuentaPuntos.findUnique({
          where: { clienteId },
        });
        if (!cuenta)
          return { saldoDisponible: 0, puntosPendientes: 0, movimientos: [] };
        const pendientes = await puntosPendientes(tx, cuenta.id, new Date());
        const movimientos = await tx.movimientoPuntos.findMany({
          where: { cuentaPuntosId: cuenta.id },
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        });
        return {
          saldoDisponible: cuenta.activa
            ? Math.max(0, cuenta.saldo - pendientes)
            : 0,
          puntosPendientes: pendientes,
          movimientos,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  beneficiosDisponibles() {
    return this.prisma.beneficio.findMany({
      where: vigencia(new Date()),
      orderBy: { id: 'asc' },
    });
  }

  // Mis beneficios: cupones del cliente, los más recientes primero
  async misCupones(clienteId: string) {
    const canjes = await this.prisma.canje.findMany({
      where: { clienteId },
      include: incluirBeneficio,
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
    });
    const ahora = new Date();
    return canjes.map((canje) => datosCupon(canje, ahora));
  }

  async adquirir(
    clienteId: string,
    { beneficioId, claveIdempotencia }: AdquirirCuponDto,
  ) {
    const where = { idempotencyKey: claveIdempotencia };
    for (let intento = 0; intento < 3; intento++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const cuenta = await bloquearCuenta(tx, clienteId);
          const previo = await tx.canje.findUnique({
            where,
            include: incluirBeneficio,
          });
          // Doble Confirmar: la misma clave devuelve el canje original
          if (previo) {
            if (
              previo.clienteId !== clienteId ||
              previo.beneficioId !== beneficioId
            ) {
              throw new ConflictException(
                'La clave ya corresponde a otro canje.',
              );
            }
            return datosCupon(previo);
          }

          await tx.$queryRaw`SELECT id FROM beneficio WHERE id = ${beneficioId} FOR SHARE`;
          const ahora = new Date();
          const beneficio = await tx.beneficio.findFirst({
            where: { id: beneficioId, ...vigencia(ahora) },
          });
          if (!beneficio)
            throw new NotFoundException(
              'El beneficio no está disponible: está inactivo o vencido.',
            );
          if (
            !cuenta?.activa ||
            cuenta.saldo - (await puntosPendientes(tx, cuenta.id, ahora)) <
              beneficio.costoPuntos
          ) {
            throw new ConflictException(
              'No tienes puntos disponibles suficientes para este beneficio.',
            );
          }

          const saldoResultante = cuenta.saldo - beneficio.costoPuntos;
          const canje = await tx.canje.create({
            data: {
              ...where,
              clienteId,
              beneficioId,
              puntosUsados: beneficio.costoPuntos,
              codigo: randomBytes(10).toString('hex'),
              creadoEn: ahora,
            },
            include: incluirBeneficio,
          });
          await tx.cuentaPuntos.update({
            where: { id: cuenta.id },
            data: { saldo: saldoResultante },
          });
          await tx.movimientoPuntos.create({
            data: {
              cuentaPuntosId: cuenta.id,
              canjeId: canje.id,
              tipo: TipoMovimientoPuntos.CANJE,
              puntos: -beneficio.costoPuntos,
              saldoAnterior: cuenta.saldo,
              saldoResultante,
              fecha: canje.creadoEn,
            },
          });
          return datosCupon(canje, ahora);
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
    }
    throw new ConflictException(
      'No se pudo asignar un código único. Reintenta con la misma clave.',
    );
  }

  async verificar(codigo: string) {
    const canje = await this.prisma.canje.findUnique({
      where: { codigo },
      include: incluirBeneficio,
    });
    return validarCupon(canje, new Date());
  }

  utilizar(codigo: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM canje WHERE codigo = ${codigo} FOR NO KEY UPDATE`;
      const canje = await tx.canje.findUnique({
        where: { codigo },
        include: incluirBeneficio,
      });
      const utilizadoEn = new Date();
      const cupon = validarCupon(canje, utilizadoEn);
      await tx.canje.update({ where: { id: cupon.id }, data: { utilizadoEn } });
      return { ...cupon, utilizadoEn, estado: 'UTILIZADO' as EstadoCupon };
    });
  }

  beneficiosAdministrativos() {
    return this.prisma.beneficio
      .findMany({ orderBy: { id: 'asc' } })
      .then((beneficios) => {
        const ahora = new Date();
        return beneficios.map((beneficio) => ({
          ...beneficio,
          estado: beneficio.deshabilitadoEn
            ? 'DESHABILITADO'
            : beneficio.vigenteHasta <= ahora
              ? 'CADUCADO'
              : beneficio.vigenteDesde > ahora
                ? 'FUTURO'
                : beneficio.activo
                  ? 'ACTIVO'
                  : 'INACTIVO',
        }));
      });
  }

  crearBeneficio(usuarioId: string, dto: CrearBeneficioDto) {
    const datos = {
      ...dto,
      ...fechasBeneficio(dto.vigenteDesde, dto.vigenteHasta, new Date()),
    };
    return this.prisma.$transaction(async (tx) => {
      const beneficio = await tx.beneficio.create({ data: datos });
      await tx.historialLealtad.create({
        data: {
          usuarioId,
          entidad: 'BENEFICIO',
          entidadId: beneficio.id,
          accion: 'CREACION',
          valorNuevo: beneficio,
        },
      });
      return beneficio;
    });
  }

  editarBeneficio(
    usuarioId: string,
    id: number,
    dto: EditarBeneficioDto | null,
  ) {
    // Un id fuera de INTEGER no existe: 404 en vez de error de base
    if (id > ID_MAXIMO)
      return Promise.reject(new NotFoundException('El beneficio no existe.'));
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM beneficio WHERE id = ${id} FOR NO KEY UPDATE`;
      const anterior = await tx.beneficio.findUnique({ where: { id } });
      if (!anterior) throw new NotFoundException('El beneficio no existe.');
      if (anterior.deshabilitadoEn)
        throw new ConflictException(
          'El beneficio fue deshabilitado definitivamente.',
        );
      const ahora = new Date();
      const datos = dto
        ? {
            ...dto,
            ...fechasBeneficio(
              dto.vigenteDesde ?? anterior.vigenteDesde,
              dto.vigenteHasta ?? anterior.vigenteHasta,
              ahora,
              anterior.vigenteDesde,
            ),
          }
        : { activo: false, deshabilitadoEn: ahora };
      const beneficio = await tx.beneficio.update({
        where: { id },
        data: { ...datos, modificadoEn: ahora },
      });
      await tx.historialLealtad.create({
        data: {
          usuarioId,
          entidad: 'BENEFICIO',
          entidadId: id,
          accion: dto ? 'MODIFICACION' : 'DESHABILITACION',
          valorAnterior: anterior,
          valorNuevo: beneficio,
        },
      });
      return beneficio;
    });
  }

  consultarRegla() {
    return reglaVigente(this.prisma, new Date());
  }

  configurarRegla(usuarioId: string, puntosPorDolar: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE regla_puntos IN SHARE ROW EXCLUSIVE MODE`;
      const ahora = new Date();
      const anterior = await reglaVigente(tx, ahora);
      if (anterior?.puntosPorDolar === puntosPorDolar) return anterior;
      await tx.reglaPuntos.updateMany({
        where: { activa: true },
        data: { activa: false, modificadaEn: ahora, deshabilitadaEn: ahora },
      });
      const regla = await tx.reglaPuntos.create({
        data: { puntosPorDolar, vigenteDesde: ahora, creadaEn: ahora },
      });
      await tx.historialLealtad.create({
        data: {
          usuarioId,
          entidad: 'REGLA',
          entidadId: regla.id,
          accion: anterior ? 'MODIFICACION' : 'CREACION',
          valorAnterior: anterior ?? Prisma.DbNull,
          valorNuevo: regla,
        },
      });
      return regla;
    });
  }

  // H20: sin regla vigente las compras no acumulan puntos
  deshabilitarRegla(usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE regla_puntos IN SHARE ROW EXCLUSIVE MODE`;
      const ahora = new Date();
      const anterior = await reglaVigente(tx, ahora);
      if (!anterior)
        throw new NotFoundException('No hay una regla de puntos vigente.');
      const regla = await tx.reglaPuntos.update({
        where: { id: anterior.id },
        data: { activa: false, modificadaEn: ahora, deshabilitadaEn: ahora },
      });
      await tx.historialLealtad.create({
        data: {
          usuarioId,
          entidad: 'REGLA',
          entidadId: regla.id,
          accion: 'DESHABILITACION',
          valorAnterior: anterior,
          valorNuevo: regla,
        },
      });
      return regla;
    });
  }
}
