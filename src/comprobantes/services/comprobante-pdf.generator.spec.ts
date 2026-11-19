import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ComprobantePdfGenerator } from './comprobante-pdf.generator.js';

function leerLineas(pdf: Buffer) {
  const contenido = pdf.toString('latin1');
  return Array.from(
    contenido.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
  ).flatMap(([, stream]) => {
    const pagina = inflateSync(Buffer.from(stream!, 'latin1')).toString();
    return Array.from(pagina.matchAll(/\[([^\]]+)\]\s*TJ/g), ([, texto]) =>
      Array.from(texto!.matchAll(/<([a-f\d]+)>/gi), ([, hex]) =>
        Buffer.from(hex!, 'hex').toString('latin1'),
      ).join(''),
    );
  });
}

const comprobante = {
  numero: 'CP-27',
  fechaEmision: new Date('2026-11-17T15:00:00.000Z'),
  transaccionId: 'transaccion-27',
  contenidoSnapshot: {
    version: 1 as const,
    pedidoId: 49,
    items: [
      {
        nombre: 'Café original',
        cantidad: 2,
        precioUnitario: '2.25',
        subtotal: '4.50',
      },
      {
        nombre: 'Limón original',
        cantidad: 1,
        precioUnitario: '0.30',
        subtotal: '0.30',
      },
    ],
    total: '4.80',
  },
};

describe('ComprobantePdfGenerator', () => {
  const generator = new ComprobantePdfGenerator();

  it.each([
    [
      { montoRecibido: '5.00', cambio: '0.20' },
      'Efectivo. Recibido: 5.00   Cambio: 0.20',
    ],
    [
      { marca: 'VISA', ultimosCuatro: '4242' },
      'Tarjeta simulada: VISA **** 4242',
    ],
  ])(
    'imprime el detalle historico %j en ambas descargas',
    async (detallePago, linea) => {
      for (const tipo of ['ORIGINAL', 'COPIA'] as const) {
        const pdf = await generator.generar(
          { ...comprobante, detallePago },
          tipo,
        );
        expect(leerLineas(pdf)).toContain(linea);
      }
    },
  );

  it('genera el PDF sin informacion complementaria para detalle null', async () => {
    const pdf = await generator.generar(
      { ...comprobante, detallePago: null },
      'COPIA',
    );
    expect(leerLineas(pdf).at(-1)).toBe('Total pagado: 4.80');
  });

  it('genera documentos PDF con la misma información y el número original', async () => {
    const original = await generator.generar(comprobante, 'ORIGINAL');
    const copia = await generator.generar(comprobante, 'COPIA');

    for (const buffer of [original, copia]) {
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString('latin1')).toMatch(/^%PDF-\d\.\d/);
      expect(buffer.toString('latin1')).toMatch(/startxref\s+\d+\s+%%EOF\s*$/);
    }

    const [tituloOriginal, ...datosOriginal] = leerLineas(original);
    const [tituloCopia, ...datosCopia] = leerLineas(copia);
    expect(tituloOriginal).toBe('Comprobante CP-27');
    expect(tituloCopia).toBe('Comprobante CP-27 | COPIA');
    expect(datosCopia).toEqual(datosOriginal);
    expect(datosOriginal).toEqual([
      'Fecha de emisión: 2026-11-17T15:00:00.000Z',
      'Pedido: 49',
      'Transacción: transaccion-27',
      'Café original',
      'Cantidad: 2   Precio unitario: 2.25   Subtotal: 4.50',
      'Limón original',
      'Cantidad: 1   Precio unitario: 0.30   Subtotal: 0.30',
      'Total pagado: 4.80',
    ]);
  });

  it('incluye todos los artículos cuando el comprobante ocupa varias páginas', async () => {
    const items = Array.from({ length: 80 }, (_, i) => ({
      nombre: `Artículo ${i + 1}`,
      cantidad: 1,
      precioUnitario: '0.10',
      subtotal: '0.10',
    }));
    const pdf = await generator.generar(
      {
        ...comprobante,
        contenidoSnapshot: {
          ...comprobante.contenidoSnapshot,
          items,
          total: '8.00',
        },
      },
      'COPIA',
    );

    expect(
      [...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length,
    ).toBeGreaterThan(1);
    expect(
      leerLineas(pdf).filter((linea) => linea.startsWith('Artículo ')),
    ).toEqual(items.map(({ nombre }) => nombre));
    expect(leerLineas(pdf).at(-1)).toBe('Total pagado: 8.00');
  });
});
