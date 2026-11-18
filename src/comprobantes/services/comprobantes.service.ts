import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Rol, TipoPedido, type Prisma, type User } from '@PrismaClient';
import { ComprobantesRepository } from '../repositories/comprobantes.repository.js';
import { ComprobantePdfGenerator } from './comprobante-pdf.generator.js';
import { esSnapshotPdf } from './comprobante-pdf.snapshot.js';

@Injectable()
export class ComprobantesService {
  @Inject(ComprobantePdfGenerator)
  private readonly pdfGenerator!: ComprobantePdfGenerator;

  constructor(
    @Inject(ComprobantesRepository)
    private readonly comprobantesRepository: ComprobantesRepository,
  ) {}

  // La consulta de metadatos deja intacta la marca de primera generación.
  async consultar(id: number, usuario: User) {
    const { primeraGeneracionPdfEn, ...resultado } =
      await this.buscarAutorizado(id, usuario);
    return resultado;
  }

  private async buscarAutorizado(id: number, usuario: User) {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      throw new NotFoundException('No existe el comprobante');
    }

    const comprobante = await this.comprobantesRepository.buscarPorId(id);
    if (!comprobante) throw new NotFoundException('No existe el comprobante');

    const { pedido, ...resultado } = comprobante;
    const puedeConsultar =
      usuario.rol === Rol.GERENTE_GENERAL ||
      (usuario.rol === Rol.CLIENTE && pedido.clienteId === usuario.id) ||
      (usuario.rol === Rol.GERENTE &&
        pedido.sucursalId === usuario.sucursalId) ||
      (usuario.rol === Rol.MESERO &&
        pedido.tipo === TipoPedido.MESA &&
        pedido.sucursalId === usuario.sucursalId &&
        pedido.meseroId === usuario.id);

    if (!puedeConsultar) {
      throw new ForbiddenException(
        'No tienes permiso para ver este comprobante',
      );
    }

    return resultado;
  }

  async descargarPdf(id: number, usuario: User) {
    const comprobante = await this.buscarAutorizado(id, usuario);
    if (!esSnapshotPdf(comprobante.contenidoSnapshot)) {
      throw new ConflictException(
        'El comprobante no tiene un snapshot compatible para generar el PDF',
      );
    }

    const datosPdf = {
      ...comprobante,
      contenidoSnapshot: comprobante.contenidoSnapshot,
    };
    const nombreArchivo = `comprobante-${comprobante.id}.pdf`;

    if (comprobante.primeraGeneracionPdfEn === null) {
      const original = await this.pdfGenerator.generar(datosPdf, 'ORIGINAL');
      // Registrar solo después de construir el Buffer permite reintentar si falla.
      // El servidor guarda la marca antes del envío HTTP, cuya recepción no confirma.
      const { count } =
        await this.comprobantesRepository.reclamarPrimeraGeneracionPdf(id);
      if (count === 1) return { buffer: original, nombreArchivo };
    }

    const buffer = await this.pdfGenerator.generar(datosPdf, 'COPIA');
    return { buffer, nombreArchivo };
  }

  emitir(
    tx: Prisma.TransactionClient,
    pago: {
      id: number;
      pedidoId: number;
      transaccionId: string;
      ticketSnapshot: Prisma.InputJsonValue;
    },
  ) {
    // H17 conserva su propia copia histórica del ticket validado por H16.
    // Las restricciones únicas protegen el número y el original por transacción.
    return this.comprobantesRepository.crear(tx, {
      numero: `CP-${pago.id}`,
      ticketId: pago.pedidoId,
      transaccionId: pago.transaccionId,
      contenidoSnapshot: pago.ticketSnapshot,
    });
  }
}
