import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Rol, TipoPedido, type User } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { ComprobantesController } from '../controllers/comprobantes.controller.js';
import { ComprobantesRepository } from '../repositories/comprobantes.repository.js';
import { ComprobantePdfGenerator } from './comprobante-pdf.generator.js';
import { ComprobantesService } from './comprobantes.service.js';

const comprobante = {
  id: 12,
  numero: 'CP-27',
  ticketId: 49,
  transaccionId: 'transaccion-27',
  fechaEmision: new Date('2026-11-17T15:00:00.000Z'),
  primeraGeneracionPdfEn: null,
  contenidoSnapshot: {
    version: 1,
    pedidoId: 49,
    items: [
      {
        platilloId: 5,
        nombre: 'Café original',
        cantidad: 2,
        precioUnitario: '2.25',
        subtotal: '4.50',
      },
    ],
    total: '4.50',
  },
  pedido: {
    tipo: TipoPedido.MESA,
    clienteId: 'cliente-1',
    meseroId: 'mesero-1',
    sucursalId: 1,
  },
};
const cliente = { id: 'cliente-1', rol: Rol.CLIENTE } as User;

describe('Consulta y descarga de comprobantes', () => {
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const generar = vi.fn();
  let controller: ComprobantesController;

  beforeEach(async () => {
    let primeraGeneracionPdfEn: Date | null = null;
    findUnique.mockReset().mockImplementation(async () => ({
      ...structuredClone(comprobante),
      primeraGeneracionPdfEn,
    }));
    updateMany.mockReset().mockImplementation(async ({ data }) => {
      if (primeraGeneracionPdfEn !== null) return { count: 0 };
      primeraGeneracionPdfEn = data.primeraGeneracionPdfEn;
      return { count: 1 };
    });
    generar
      .mockReset()
      .mockImplementation(async (_datos, tipo) => Buffer.from(tipo));
    const module = await Test.createTestingModule({
      providers: [
        ComprobantesRepository,
        { provide: ComprobantePdfGenerator, useValue: { generar } },
        {
          provide: PrismaService,
          useValue: { comprobante: { findUnique, updateMany } },
        },
        ComprobantesService,
      ],
    }).compile();
    controller = new ComprobantesController(module.get(ComprobantesService));
  });

  it('consulta sin reclamar y entrega ORIGINAL, COPIA y COPIA con los mismos datos', async () => {
    const {
      pedido: _pedido,
      primeraGeneracionPdfEn: _primeraGeneracionPdfEn,
      ...historico
    } = comprobante;
    const antes = await controller.consultar(comprobante.id, cliente);
    expect(antes).toStrictEqual(historico);
    expect(updateMany).not.toHaveBeenCalled();
    const descarga = await controller.descargar(comprobante.id, cliente);
    expect(descarga.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="comprobante-12.pdf"',
    });
    expect(await controller.consultar(comprobante.id, cliente)).toStrictEqual(
      antes,
    );
    await controller.descargar(comprobante.id, cliente);
    await controller.descargar(comprobante.id, cliente);
    expect(generar.mock.calls.map(([, tipo]) => tipo)).toEqual([
      'ORIGINAL',
      'COPIA',
      'COPIA',
    ]);
    expect(
      generar.mock.calls.map(([datos]) => datos.contenidoSnapshot),
    ).toEqual(Array(3).fill(historico.contenidoSnapshot));
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: comprobante.id, primeraGeneracionPdfEn: null },
      data: { primeraGeneracionPdfEn: expect.any(Date) },
    });
  });

  it('solo entrega un ORIGINAL cuando ambas descargas ven el indicador vacío', async () => {
    const descargas = await Promise.all([
      controller.descargar(12, cliente),
      controller.descargar(12, cliente),
    ]);
    const textos = await Promise.all(
      descargas.map(async (descarga) => {
        const partes: Buffer[] = [];
        for await (const parte of descarga.getStream()) partes.push(parte);
        return Buffer.concat(partes).toString();
      }),
    );
    expect(textos.sort()).toEqual(['COPIA', 'ORIGINAL']);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('conserva el ORIGINAL disponible si falla la construcción del PDF', async () => {
    generar.mockRejectedValueOnce(new Error('Falló el Buffer'));
    await expect(controller.descargar(12, cliente)).rejects.toThrow(
      'Falló el Buffer',
    );
    expect(updateMany).not.toHaveBeenCalled();
    await controller.descargar(12, cliente);
    expect(generar.mock.calls.map(([, tipo]) => tipo)).toEqual([
      'ORIGINAL',
      'ORIGINAL',
    ]);
  });

  it('devuelve 404 para un comprobante que no existe', async () => {
    findUnique.mockResolvedValue(null);
    await expect(controller.consultar(99, cliente)).rejects.toMatchObject({
      status: 404,
    });
    await expect(controller.descargar(99, cliente)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('permite consultar metadatos históricos y devuelve 409 al descargar sin snapshot', async () => {
    findUnique.mockResolvedValue({ ...comprobante, contenidoSnapshot: null });
    await expect(controller.consultar(12, cliente)).resolves.toMatchObject({
      contenidoSnapshot: null,
    });
    await expect(controller.descargar(12, cliente)).rejects.toMatchObject({
      status: 409,
    });
  });

  it.each([
    { id: 'cliente-2', rol: Rol.CLIENTE },
    { id: 'mesero-2', rol: Rol.MESERO, sucursalId: 2 },
    { rol: Rol.GERENTE, sucursalId: 2 },
  ])('devuelve 403 fuera del alcance del usuario %j', async (usuario) => {
    await expect(
      controller.consultar(12, usuario as User),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      controller.descargar(12, usuario as User),
    ).rejects.toMatchObject({ status: 403 });
    expect(generar).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'mesero-2', rol: Rol.MESERO, sucursalId: 1 },
    { rol: Rol.GERENTE, sucursalId: 1 },
    { rol: Rol.GERENTE_GENERAL },
  ])('permite consultar dentro del alcance del usuario %j', async (usuario) => {
    await expect(
      controller.consultar(12, usuario as User),
    ).resolves.toMatchObject({ id: 12 });
  });
});
