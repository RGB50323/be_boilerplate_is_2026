import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EstadoPago } from '@PrismaClient';
import { PagoRepository } from '../repositories/pago.repository.js';
import { PagosService } from './pagos.service.js';
import { EstadoTransaccionSimulada } from './pasarela-simulada.service.js';

const INTERVALO_MS = 500;
const RETRASO_MINIMO_MS = 5000;
const RETRASO_MAXIMO_MS = 10000;

function retrasoPorTransaccion(transaccionId: string): number {
  // La pasarela genera un ID aleatorio una sola vez. Su valor persistido fija
  // el retraso, con el mismo resultado en cada consulta e instancia.
  const semilla = createHash('sha256')
    .update(transaccionId)
    .digest()
    .readUInt32BE();
  return (
    RETRASO_MINIMO_MS + (semilla % (RETRASO_MAXIMO_MS - RETRASO_MINIMO_MS + 1))
  );
}

@Injectable()
export class ResolucionTarjetasService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ResolucionTarjetasService.name);
  private readonly retrasoPruebasMs = this.leerRetrasoPruebas();
  private readonly resultado = this.leerResultado();
  private cursor = 0;
  private activo = false;
  private timer?: NodeJS.Timeout;
  private enCurso?: Promise<void>;

  constructor(
    private readonly repository: PagoRepository,
    private readonly pagos: PagosService,
  ) {}

  onApplicationBootstrap() {
    this.activo = true;
    this.programar(0);
  }

  async onModuleDestroy() {
    this.activo = false;
    clearTimeout(this.timer);
    await this.enCurso;
  }

  private programar(espera: number) {
    if (!this.activo) return;
    // El temporizador solo despierta al trabajador. PostgreSQL conserva los pendientes.
    this.timer = setTimeout(() => {
      this.enCurso = this.procesarLote()
        .catch((error: unknown) =>
          this.logger.error('No se pudo consultar la cola de tarjetas', error),
        )
        .finally(() => this.programar(INTERVALO_MS));
    }, espera);
    this.timer.unref();
  }

  async procesarLote() {
    if (this.resultado === EstadoTransaccionSimulada.PENDIENTE) return;
    const ahora = Date.now();
    const limite = new Date(
      ahora - (this.retrasoPruebasMs ?? RETRASO_MINIMO_MS),
    );
    const pagos = await this.repository.buscarResolucionesSimuladas(
      limite,
      this.cursor,
    );
    if (pagos.length === 0) this.cursor = 0;

    for (const pago of pagos) {
      this.cursor = pago.id;
      if (!pago.transaccionId) continue;
      if (pago.estado === EstadoPago.PENDIENTE) {
        const retraso =
          this.retrasoPruebasMs ?? retrasoPorTransaccion(pago.transaccionId);
        if (pago.creadoEn.getTime() + retraso > ahora) continue;
      }
      try {
        await this.pagos.resolverTarjetaSimulada(
          pago.transaccionId,
          this.resultado,
        );
      } catch (error: unknown) {
        this.logger.error('No se pudo resolver el pago #' + pago.id, error);
      }
    }
  }

  private leerRetrasoPruebas() {
    if (process.env.NODE_ENV !== 'test') return undefined;
    const valor = process.env.H16_SIMULADOR_RETRASO_MS;
    if (valor === undefined) return undefined;
    const ms = Number(valor);
    if (
      !/^\d+$/.test(valor) ||
      !Number.isSafeInteger(ms) ||
      ms > 2_147_483_647
    ) {
      throw new Error(
        'H16_SIMULADOR_RETRASO_MS debe ser un entero no negativo de hasta 2147483647',
      );
    }
    return ms;
  }

  private leerResultado() {
    if (process.env.NODE_ENV === 'test') {
      const valor = process.env.H16_SIMULADOR_RESULTADO;
      if (
        valor === EstadoTransaccionSimulada.RECHAZADO ||
        valor === EstadoTransaccionSimulada.PENDIENTE
      ) {
        return valor;
      }
      if (
        valor !== undefined &&
        valor !== EstadoTransaccionSimulada.CONFIRMADO
      ) {
        throw new Error(
          'H16_SIMULADOR_RESULTADO debe ser CONFIRMADO, RECHAZADO o PENDIENTE',
        );
      }
    }
    return EstadoTransaccionSimulada.CONFIRMADO;
  }
}
