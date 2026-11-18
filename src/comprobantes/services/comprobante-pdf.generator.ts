import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { SnapshotPdf } from './comprobante-pdf.snapshot.js';

@Injectable()
export class ComprobantePdfGenerator {
  generar(
    comprobante: {
      numero: string;
      fechaEmision: Date;
      transaccionId: string;
      contenidoSnapshot: SnapshotPdf;
    },
    tipo: 'ORIGINAL' | 'COPIA',
  ): Promise<Buffer> {
    const { numero, fechaEmision, transaccionId, contenidoSnapshot } =
      comprobante;
    const doc = new PDFDocument({ size: 'A4', margin: 48 });

    return new Promise((resolve, reject) => {
      const fragmentos: Buffer[] = [];
      doc.on('data', (fragmento: Buffer) => fragmentos.push(fragmento));
      doc.once('end', () => resolve(Buffer.concat(fragmentos)));
      doc.once('error', reject);

      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(`Comprobante ${numero}${tipo === 'COPIA' ? ' | COPIA' : ''}`);
      doc
        .font('Helvetica')
        .fontSize(11)
        .text(`Fecha de emisión: ${fechaEmision.toISOString()}`)
        .text(`Pedido: ${contenidoSnapshot.pedidoId}`)
        .text(`Transacción: ${transaccionId}`)
        .moveDown();

      for (const item of contenidoSnapshot.items) {
        doc.font('Helvetica-Bold').text(item.nombre);
        doc
          .font('Helvetica')
          .text(
            `Cantidad: ${item.cantidad}   Precio unitario: ${item.precioUnitario}   Subtotal: ${item.subtotal}`,
          )
          .moveDown(0.5);
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(`Total pagado: ${contenidoSnapshot.total}`);
      doc.end();
    });
  }
}
