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
import {
  AdquirirCuponDto,
  CrearBeneficioDto,
  EditarBeneficioDto,
} from './lealtad.dto.js';
import { bloquearCuenta, puntosPendientes, reglaVigente } from './puntos.js';

const VIGENCIA_CUPON_MS = 5 * 60 * 1000;
const incluirBeneficio = {
  beneficio: { select: { id: true, nombre: true } },
} as const;

function vigencia(ahora: Date): Prisma.BeneficioWhereInput {
  return {
    activo: true,
    deshabilitadoEn: null,
    vigenteDesde: { lte: ahora },
    vigenteHasta: { gt: ahora },
  };
}

function datosCupon(
  canje: Prisma.CanjeGetPayload<{ include: typeof incluirBeneficio }>,
) {
  return {
    id: canje.id,
    codigo: canje.codigo,
    beneficio: canje.beneficio,
    expiraEn: new Date(canje.creadoEn.getTime() + VIGENCIA_CUPON_MS),
    utilizadoEn: canje.utilizadoEn,
  };
}

function validarCupon(
  canje: ReturnType<typeof datosCupon> | null,
  ahora: Date,
) {
  if (!canje) throw new NotFoundException('El cupon no existe');
  if (canje.utilizadoEn)
    throw new ConflictException('El cupon ya fue utilizado');
  if (canje.expiraEn <= ahora) throw new GoneException('El cupon ha expirado');
  return canje;
}

const diaEnElSalvador = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/El_Salvador',
});

function errorVigencia(campo: 'vigenteDesde' | 'vigenteHasta', mensaje: string) {
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
          if (previo) {
            if (
              previo.clienteId !== clienteId ||
              previo.beneficioId !== beneficioId
            ) {
              throw new ConflictException(
                'La clave ya corresponde a otro canje',
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
            throw new NotFoundException('El beneficio no esta disponible');
          if (
            !cuenta?.activa ||
            cuenta.saldo - (await puntosPendientes(tx, cuenta.id, ahora)) <
              beneficio.costoPuntos
          ) {
            throw new ConflictException(
              'Saldo de puntos disponible insuficiente',
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
          return datosCupon(canje);
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
      'No se pudo asignar un codigo unico. Reintente con la misma clave',
    );
  }

  async verificar(codigo: string) {
    const canje = await this.prisma.canje.findUnique({
      where: { codigo },
      include: incluirBeneficio,
    });
    return validarCupon(canje && datosCupon(canje), new Date());
  }

  utilizar(codigo: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM canje WHERE codigo = ${codigo} FOR NO KEY UPDATE`;
      const canje = await tx.canje.findUnique({
        where: { codigo },
        include: incluirBeneficio,
      });
      const utilizadoEn = new Date();
      const datos = validarCupon(canje && datosCupon(canje), utilizadoEn);
      await tx.canje.update({ where: { id: datos.id }, data: { utilizadoEn } });
      return { ...datos, utilizadoEn };
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM beneficio WHERE id = ${id} FOR NO KEY UPDATE`;
      const anterior = await tx.beneficio.findUnique({ where: { id } });
      if (!anterior) throw new NotFoundException('El beneficio no existe');
      if (anterior.deshabilitadoEn)
        throw new ConflictException(
          'El beneficio fue deshabilitado definitivamente',
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
}
