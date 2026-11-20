import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Rol, type Prisma } from '@PrismaClient';
import { UserRepository } from '@Users/repositories';
import { ReglaPuntosService } from '../../beneficios/services/regla-puntos.service.js';
import { calcularPuntos } from '../calculo-puntos.js';
import { AcreditacionesRepository } from '../repositories/acreditaciones.repository.js';

const BLOQUEO_MS = 24 * 60 * 60 * 1000;
const TAMANO_LOTE = 100;

@Injectable()
export class AcreditacionesService {
  private readonly logger = new Logger(AcreditacionesService.name);

  constructor(
    @Inject(AcreditacionesRepository)
    private readonly repositorio: AcreditacionesRepository,
    @Inject(UserRepository) private readonly usuarios: UserRepository,
    @Inject(ReglaPuntosService) private readonly reglas: ReglaPuntosService,
  ) {}

  async validarBeneficiario(identidad: { correo: string } | { id: string }) {
    const cliente = await this.usuarios.buscarTitularLealtad(identidad);
    if (!cliente || cliente.rol !== Rol.CLIENTE) {
      throw new BadRequestException(
        'El correo no corresponde a un cliente registrado.',
      );
    }
    if (!cliente.isActive || cliente.cuentaPuntos?.activa === false) {
      throw new BadRequestException(
        'El cliente no está habilitado para acumular puntos.',
      );
    }
    return cliente.id;
  }

  fijarConfirmacion(tx: Prisma.TransactionClient, requiereRegla: boolean) {
    return requiereRegla
      ? this.reglas.prepararConfirmacion(tx)
      : this.repositorio.ahora(tx);
  }

  fijarReembolso(tx: Prisma.TransactionClient, transaccionId: string) {
    return this.repositorio.fijarReembolso(tx, transaccionId);
  }

  cancelarPendiente(
    tx: Prisma.TransactionClient,
    transaccionId: string,
    fecha: Date,
  ) {
    return this.repositorio.cancelarPendiente(tx, transaccionId, fecha);
  }

  async registrarConfirmacion(
    tx: Prisma.TransactionClient,
    pagoId: number,
    clienteId: string,
    montoPagado: Prisma.Decimal,
    confirmadoEn: Date,
  ) {
    const regla = await this.reglas.consultarVigente(tx, confirmadoEn);
    if (!regla)
      throw new Error('Falta una regla vigente para acreditar el pago.');
    const cuenta = await this.repositorio.asegurarCuenta(tx, clienteId);

    await this.repositorio.crear(tx, {
      cuentaPuntosId: cuenta.id,
      pagoId,
      confirmadoEn,
      liberableEn: new Date(confirmadoEn.getTime() + BLOQUEO_MS),
      reglaId: regla.id,
      puntosPorDolar: regla.puntosPorDolar,
      ...calcularPuntos(montoPagado, regla.puntosPorDolar),
    });
  }

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async ejecutarLiberacion() {
    try {
      await this.liberarVencidas(await this.repositorio.ahora());
    } catch (error) {
      this.logger.error(
        'No se pudo consultar las acreditaciones vencidas',
        error,
      );
    }
  }

  async liberarVencidas(ahora: Date) {
    let cursor = 0;
    let liberadas = 0;
    for (;;) {
      const lote = await this.repositorio.listarLiberables(
        ahora,
        cursor,
        TAMANO_LOTE,
      );
      for (const { id } of lote) {
        try {
          if (await this.repositorio.liberar(id, ahora)) liberadas++;
        } catch (error) {
          this.logger.error('No se pudo liberar la acreditación #' + id, error);
        }
        cursor = id;
      }
      if (lote.length < TAMANO_LOTE) return liberadas;
    }
  }
}
