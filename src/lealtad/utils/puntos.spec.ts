import { Prisma, TipoPedido } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acumularPorPago, revertirPuntosPorReembolso } from './puntos.js';

const confirmadoEn = new Date('2026-11-20T18:00:00Z');
const pago = { pedidoId: 7, monto: new Prisma.Decimal('12.80'), confirmadoEn };
const llevar = { tipo: TipoPedido.LLEVAR, clienteId: 'c-1' };

function transaccion() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 3, saldo: 50, activa: true }]),
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'c-1' }]) },
    reglaPuntos: {
      findFirst: vi.fn().mockResolvedValue({ id: 2, puntosPorDolar: 1 }),
    },
    cuentaPuntos: { createMany: vi.fn(), update: vi.fn() },
    movimientoPuntos: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}
type Tx = ReturnType<typeof transaccion>;
const comoTx = (tx: Tx) => tx as unknown as Prisma.TransactionClient;

describe('H18 acumular puntos por pago', () => {
  let tx: Tx;
  beforeEach(() => {
    tx = transaccion();
  });

  it('acredita monto × puntos por dólar redondeado hacia abajo', async () => {
    await acumularPorPago(comoTx(tx), pago, llevar);
    expect(tx.movimientoPuntos.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          puntos: 12,
          saldoAnterior: 50,
          saldoResultante: 62,
          pedidoId: 7,
          reglaId: 2,
        }),
        skipDuplicates: true,
      }),
    );
    expect(tx.cuentaPuntos.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { saldo: 62 },
    });
  });

  it('una compra ya procesada no vuelve a sumar puntos', async () => {
    tx.movimientoPuntos.createMany.mockResolvedValue({ count: 0 });
    await acumularPorPago(comoTx(tx), pago, llevar);
    expect(tx.cuentaPuntos.update).not.toHaveBeenCalled();
  });

  it('un pago sin confirmar no acredita', async () => {
    await acumularPorPago(comoTx(tx), { ...pago, confirmadoEn: null }, llevar);
    expect(tx.movimientoPuntos.createMany).not.toHaveBeenCalled();
  });

  it('sin regla vigente (deshabilitada) no acredita', async () => {
    tx.reglaPuntos.findFirst.mockResolvedValue(null);
    await acumularPorPago(comoTx(tx), pago, llevar);
    expect(tx.movimientoPuntos.createMany).not.toHaveBeenCalled();
  });

  it('una cuenta de puntos inactiva no acredita', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 3, saldo: 50, activa: false }]);
    await acumularPorPago(comoTx(tx), pago, llevar);
    expect(tx.movimientoPuntos.createMany).not.toHaveBeenCalled();
  });

  it('un pedido de mesa sin correo de lealtad no acredita', async () => {
    await acumularPorPago(comoTx(tx), pago, {
      tipo: TipoPedido.MESA,
      clienteId: null,
    });
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });
});

describe('H18 reembolso', () => {
  let tx: Tx;
  beforeEach(() => {
    tx = transaccion();
    tx.movimientoPuntos.findUnique.mockResolvedValue({
      puntos: 12,
      fecha: new Date('2026-11-01T00:00:00Z'),
      cuenta: { clienteId: 'c-1' },
    });
  });

  it('descuenta los puntos de la compra aunque ya pasaron las 24 horas', async () => {
    await revertirPuntosPorReembolso(comoTx(tx), 7);
    expect(tx.movimientoPuntos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        puntos: -12,
        saldoAnterior: 50,
        saldoResultante: 38,
        pedidoId: 7,
      }),
    });
    expect(tx.cuentaPuntos.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { saldo: 38 },
    });
  });

  it('si ya canjeó esos puntos, el saldo queda en cero', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 3, saldo: 5, activa: true }]);
    await revertirPuntosPorReembolso(comoTx(tx), 7);
    expect(tx.cuentaPuntos.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { saldo: 0 },
    });
  });

  it('una compra que no generó puntos no cambia nada', async () => {
    tx.movimientoPuntos.findUnique.mockResolvedValue(null);
    await revertirPuntosPorReembolso(comoTx(tx), 7);
    expect(tx.movimientoPuntos.create).not.toHaveBeenCalled();
  });
});
