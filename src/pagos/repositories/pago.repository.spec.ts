import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EstadoPago, EstadoPedido, TipoPedido } from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import { ComprobantesRepository } from '../../comprobantes/repositories/comprobantes.repository.js';
import { ComprobantesService } from '../../comprobantes/services/comprobantes.service.js';
import type { AcreditacionesService } from '../../lealtad/services/acreditaciones.service.js';
import { PagoRepository } from './pago.repository.js';

function preparar() {
  const ticketSnapshot = { version: 1, pedidoId: 3, items: [], total: '4.50' };
  const detallePago = { marca: 'VISA', ultimosCuatro: '4242' };
  const tx = {
    pago: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 5, pedidoId: 3, ticketSnapshot, detallePago }),
    },
    pedido: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ tipo: TipoPedido.MESA, estado: EstadoPedido.ENTREGADO }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    comprobante: { create: vi.fn().mockResolvedValue({ id: 8, contenidoSnapshot: ticketSnapshot, detallePago }) },
  };
  const prisma = {
    $transaction: vi.fn(async (operacion: (cliente: typeof tx) => unknown) =>
      operacion(tx),
    ),
  };
  const repository = new PagoRepository(
    prisma as unknown as PrismaService,
    new ComprobantesService(new ComprobantesRepository()),
    { fijarConfirmacion: vi.fn().mockResolvedValue(new Date()) } as unknown as AcreditacionesService,
  );

  return { repository, prisma, tx, ticketSnapshot, detallePago };
}

describe('PagoRepository.confirmarYEmitirComprobante', () => {
  it('actualiza el pago y copia el snapshot usando el mismo cliente transaccional', async () => {
    const { repository, prisma, tx, ticketSnapshot, detallePago } = preparar();

    await expect(
      repository.confirmarYEmitirComprobante('tx-5', EstadoPago.PENDIENTE, false),
    ).resolves.toEqual({ count: 1 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.pago.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { transaccionId: 'tx-5', estado: EstadoPago.PENDIENTE },
      data: { estado: EstadoPago.CONFIRMADO, confirmadoEn: expect.any(Date) },
    });
    expect(tx.pedido.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 3, estado: EstadoPedido.ENTREGADO },
      data: { estado: EstadoPedido.CERRADO },
    });
    expect(tx.comprobante.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        numero: 'CP-5',
        ticketId: 3,
        transaccionId: 'tx-5',
        contenidoSnapshot: ticketSnapshot,
        detallePago,
      },
    });
  });

  it('no emite cuando otra operación ya actualizó el estado', async () => {
    const { repository, tx } = preparar();
    tx.pago.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.confirmarYEmitirComprobante('tx-5', EstadoPago.PENDIENTE, false),
    ).resolves.toEqual({ count: 0 });
    expect(tx.pago.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.comprobante.create).not.toHaveBeenCalled();
  });

  it('rechaza la confirmación dentro de la transacción si falta el snapshot', async () => {
    const { repository, prisma, tx } = preparar();
    tx.pago.findUniqueOrThrow.mockResolvedValue({
      id: 5,
      pedidoId: 3,
      ticketSnapshot: null,
    });

    const confirmacion = repository.confirmarYEmitirComprobante(
      'tx-5',
      EstadoPago.PENDIENTE,
      false,
    );
    await expect(confirmacion).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveReturnedWith(confirmacion);
    await expect(confirmacion).rejects.toMatchObject({ status: 409 });
    expect(tx.comprobante.create).not.toHaveBeenCalled();
  });

  it('propaga el error de inserción fuera del callback transaccional', async () => {
    const { repository, tx } = preparar();
    const error = new Error('Falló la emisión');
    tx.comprobante.create.mockRejectedValue(error);

    await expect(
      repository.confirmarYEmitirComprobante('tx-5', EstadoPago.PENDIENTE, false),
    ).rejects.toBe(error);
  });
});
