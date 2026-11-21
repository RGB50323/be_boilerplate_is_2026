import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LealtadService } from './lealtad.service.js';

const hoy = '2026-11-25T00:00:00.000-06:00';
const finHoy = '2026-11-25T23:59:59.999-06:00';
const ayer = '2026-11-24T00:00:00.000-06:00';
const guardado = {
  vigenteDesde: new Date('2026-11-20T18:15:00Z'),
  vigenteHasta: new Date('2026-11-24T22:30:00Z'),
  deshabilitadoEn: null,
};
const datos = { nombre: 'Limonada', costoPuntos: 30 };

function servicio() {
  const tx = {
    $queryRaw: vi.fn(),
    beneficio: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      findUnique: vi.fn().mockResolvedValue(guardado),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    historialLealtad: { create: vi.fn() },
  };
  const prisma = {
    $transaction: (accion: (cliente: typeof tx) => Promise<unknown>) =>
      accion(tx),
  } as unknown as PrismaService;
  return { lealtad: new LealtadService(prisma), tx };
}

describe('H20 vigencia de beneficios', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // En UTC y Tokio ya es 26, pero en El Salvador todavía es 25.
    vi.setSystemTime(new Date('2026-11-26T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['inicio anterior al día local', ayer, finHoy],
    ['fin anterior al inicio', hoy, ayer],
  ])('rechaza la creación con %s', (_, vigenteDesde, vigenteHasta) => {
    const { lealtad, tx } = servicio();
    expect(() =>
      lealtad.crearBeneficio('gerente', {
        ...datos,
        vigenteDesde,
        vigenteHasta,
      }),
    ).toThrow(BadRequestException);
    expect(tx.beneficio.create).not.toHaveBeenCalled();
  });

  it.each([
    [hoy, finHoy],
    ['2026-11-26T00:00:00.000-06:00', '2026-11-30T23:59:59.999-06:00'],
  ])('acepta inicio %s y fin %s', async (vigenteDesde, vigenteHasta) => {
    const { lealtad, tx } = servicio();
    await lealtad.crearBeneficio('gerente', {
      ...datos,
      vigenteDesde,
      vigenteHasta,
    });
    expect(tx.beneficio.create).toHaveBeenCalledWith({
      data: {
        ...datos,
        vigenteDesde: new Date(vigenteDesde),
        vigenteHasta: new Date(vigenteHasta),
      },
    });
  });

  it.each([{}, { vigenteDesde: guardado.vigenteDesde.toISOString() }])(
    'conserva un inicio histórico al editar con %j',
    async (parche) => {
      const { lealtad, tx } = servicio();
      await lealtad.editarBeneficio('gerente', 1, {
        nombre: 'Otro nombre',
        ...parche,
      });
      expect(tx.beneficio.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vigenteDesde: guardado.vigenteDesde,
            vigenteHasta: guardado.vigenteHasta,
          }),
        }),
      );
    },
  );

  it.each([ayer, '2026-11-20T19:00:00Z'])(
    'rechaza sustituir un inicio histórico por %s',
    async (vigenteDesde) => {
      const { lealtad, tx } = servicio();
      await expect(
        lealtad.editarBeneficio('gerente', 1, {
          vigenteDesde,
          vigenteHasta: finHoy,
        }),
      ).rejects.toMatchObject({
        response: { errores: { vigenteDesde: expect.any(String) } },
      });
      expect(tx.beneficio.update).not.toHaveBeenCalled();
    },
  );

  it('valida el fin contra el inicio efectivo en una edición parcial', async () => {
    const { lealtad, tx } = servicio();
    await expect(
      lealtad.editarBeneficio('gerente', 1, { vigenteDesde: hoy }),
    ).rejects.toMatchObject({
      response: { errores: { vigenteHasta: expect.any(String) } },
    });
    expect(tx.beneficio.update).not.toHaveBeenCalled();
    await lealtad.editarBeneficio('gerente', 1, {
      vigenteDesde: hoy,
      vigenteHasta: finHoy,
    });
    expect(tx.beneficio.update).toHaveBeenCalledTimes(1);
  });
});
