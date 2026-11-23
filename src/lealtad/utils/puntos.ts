import {
  EstadoPago,
  Prisma,
  Rol,
  TipoMovimientoPuntos,
  TipoPedido,
} from '@PrismaClient';

const BLOQUEO_MS = 24 * 60 * 60 * 1000;

export function reglaVigente(tx: Prisma.TransactionClient, ahora: Date) {
  return tx.reglaPuntos.findFirst({
    where: {
      activa: true,
      deshabilitadaEn: null,
      vigenteDesde: { lte: ahora },
    },
    orderBy: [{ vigenteDesde: 'desc' }, { id: 'desc' }],
  });
}

export async function bloquearCuenta(
  tx: Prisma.TransactionClient,
  clienteId: string,
) {
  const [cuenta] = await tx.$queryRaw<
    { id: number; saldo: number; activa: boolean }[]
  >`
    SELECT id, saldo, activa FROM cuenta_puntos
    WHERE cliente_id = ${clienteId}::uuid FOR NO KEY UPDATE
  `;
  return cuenta;
}

export async function puntosPendientes(
  tx: Prisma.TransactionClient,
  cuentaPuntosId: number,
  ahora: Date,
) {
  // El saldo contable incluye las acumulaciones desde el pago. Solo un pago
  // todavía confirmado mantiene sus puntos dentro del bloqueo.
  const resultado = await tx.movimientoPuntos.aggregate({
    where: {
      cuentaPuntosId,
      tipo: TipoMovimientoPuntos.ACUMULACION,
      fecha: { gt: new Date(ahora.getTime() - BLOQUEO_MS) },
      pedido: { pagos: { some: { estado: EstadoPago.CONFIRMADO } } },
    },
    _sum: { puntos: true },
  });
  return resultado._sum.puntos ?? 0;
}

export async function buscarClienteElegible(
  tx: Prisma.TransactionClient,
  identidad: Prisma.UserWhereInput,
) {
  const clientes = await tx.user.findMany({
    where: { ...identidad, isActive: true, rol: Rol.CLIENTE },
    select: { id: true },
    take: 2,
  });
  return clientes.length === 1 ? clientes[0] : null;
}

export async function acumularPorPago(
  tx: Prisma.TransactionClient,
  pago: { pedidoId: number; monto: Prisma.Decimal; confirmadoEn: Date | null },
  pedido: { tipo: TipoPedido; clienteId: string | null },
  correo?: string,
) {
  if (!pago.confirmadoEn) return;
  const identidad =
    pedido.tipo === TipoPedido.LLEVAR
      ? pedido.clienteId
        ? { id: pedido.clienteId }
        : null
      : correo
        ? { email: { equals: correo, mode: 'insensitive' as const } }
        : null;
  if (!identidad) return;

  const cliente = await buscarClienteElegible(tx, identidad);
  if (!cliente) return;
  // Una confirmación en curso puede ver la regla anterior ya reemplazada.
  const regla = await tx.reglaPuntos.findFirst({
    where: {
      vigenteDesde: { lte: pago.confirmadoEn },
      OR: [
        { activa: true, deshabilitadaEn: null },
        { deshabilitadaEn: { gt: pago.confirmadoEn } },
      ],
    },
    orderBy: [{ vigenteDesde: 'desc' }, { id: 'desc' }],
  });
  if (!regla) return;
  const puntos = pago.monto.mul(regla.puntosPorDolar).floor().toNumber();
  if (puntos <= 0) return;

  const clienteId = cliente.id;
  await tx.cuentaPuntos.createMany({
    data: { clienteId },
    skipDuplicates: true,
  });
  const cuenta = await bloquearCuenta(tx, clienteId);
  if (!cuenta?.activa) return;
  const saldoResultante = cuenta.saldo + puntos;
  const movimiento = await tx.movimientoPuntos.createMany({
    data: {
      cuentaPuntosId: cuenta.id,
      tipo: TipoMovimientoPuntos.ACUMULACION,
      puntos,
      saldoAnterior: cuenta.saldo,
      saldoResultante,
      pedidoId: pago.pedidoId,
      reglaId: regla.id,
      puntosPorDolar: regla.puntosPorDolar,
      fecha: pago.confirmadoEn,
    },
    skipDuplicates: true,
  });
  if (movimiento.count === 1) {
    await tx.cuentaPuntos.update({
      where: { id: cuenta.id },
      data: { saldo: saldoResultante },
    });
  }
}

// H18: un reembolso descuenta los puntos que generó esa compra, estén o no liberados
export async function revertirPuntosPorReembolso(
  tx: Prisma.TransactionClient,
  pedidoId: number,
) {
  const acumulacion = await tx.movimientoPuntos.findUnique({
    where: {
      pedidoId_tipo: { pedidoId, tipo: TipoMovimientoPuntos.ACUMULACION },
    },
    include: { cuenta: { select: { clienteId: true } } },
  });
  if (!acumulacion) return;
  const cuenta = await bloquearCuenta(tx, acumulacion.cuenta.clienteId);
  if (!cuenta) return;
  // El saldo no baja de cero si el cliente ya canjeó esos puntos
  const puntos = Math.min(cuenta.saldo, acumulacion.puntos);
  const saldoResultante = cuenta.saldo - puntos;
  await tx.movimientoPuntos.create({
    data: {
      cuentaPuntosId: cuenta.id,
      tipo: TipoMovimientoPuntos.AJUSTE,
      puntos: -puntos,
      saldoAnterior: cuenta.saldo,
      saldoResultante,
      pedidoId,
      motivo: 'Reembolso de la compra',
      fecha: new Date(),
    },
  });
  await tx.cuentaPuntos.update({
    where: { id: cuenta.id },
    data: { saldo: saldoResultante },
  });
}
