import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LealtadService } from './lealtad.service.js';

const ahora = new Date('2026-11-20T18:00:00Z');
const finBeneficio = new Date('2026-11-30T23:59:59Z');
const beneficio = { id: 12, nombre: 'Limonada', costoPuntos: 30 };
const canje = (cambios = {}) => ({
  id: 44,
  clienteId: 'c-1',
  beneficioId: 12,
  codigo: 'abc123',
  puntosUsados: 30,
  creadoEn: ahora,
  utilizadoEn: null as Date | null,
  beneficio: { id: 12, nombre: 'Limonada', vigenteHasta: finBeneficio },
  ...cambios,
});

function servicio() {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    canje: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(canje()),
      update: vi.fn(),
    },
    beneficio: { findFirst: vi.fn().mockResolvedValue(beneficio) },
    cuentaPuntos: { update: vi.fn() },
    movimientoPuntos: {
      create: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { puntos: 0 } }),
    },
    reglaPuntos: {
      findFirst: vi.fn().mockResolvedValue({ id: 2, puntosPorDolar: 1 }),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 2, activa: false }),
      updateMany: vi.fn(),
    },
    historialLealtad: { create: vi.fn() },
  };
  // Primero bloquea la cuenta y luego el beneficio
  tx.$queryRaw
    .mockResolvedValueOnce([{ id: 3, saldo: 50, activa: true }])
    .mockResolvedValue([]);
  const prisma = {
    $transaction: (accion: (cliente: typeof tx) => Promise<unknown>) =>
      accion(tx),
    canje: { findMany: vi.fn(), findUnique: vi.fn() },
  };
  return {
    lealtad: new LealtadService(prisma as unknown as PrismaService),
    tx,
    prisma,
  };
}

describe('LealtadService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ahora);
  });
  afterEach(() => vi.useRealTimers());

  describe('H19 canjear', () => {
    const datos = { beneficioId: 12, claveIdempotencia: 'clave-1' };

    it('descuenta los puntos y devuelve el cupón pendiente', async () => {
      const { lealtad, tx } = servicio();
      const cupon = await lealtad.adquirir('c-1', datos);
      expect(tx.cuentaPuntos.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { saldo: 20 },
      });
      expect(cupon).toMatchObject({
        codigo: 'abc123',
        estado: 'PENDIENTE',
        expiraEn: finBeneficio,
      });
    });

    it('un doble Confirmar con la misma clave hace un solo canje', async () => {
      const { lealtad, tx } = servicio();
      tx.canje.findUnique.mockResolvedValue(canje());
      const cupon = await lealtad.adquirir('c-1', datos);
      expect(cupon.id).toBe(44);
      expect(tx.canje.create).not.toHaveBeenCalled();
      expect(tx.cuentaPuntos.update).not.toHaveBeenCalled();
    });

    it('con puntos insuficientes no canjea', async () => {
      const { lealtad, tx } = servicio();
      tx.beneficio.findFirst.mockResolvedValue({
        ...beneficio,
        costoPuntos: 80,
      });
      await expect(lealtad.adquirir('c-1', datos)).rejects.toThrow(
        'No tienes puntos disponibles suficientes para este beneficio.',
      );
      expect(tx.canje.create).not.toHaveBeenCalled();
    });

    it('los puntos pendientes de 24 horas no alcanzan para canjear', async () => {
      const { lealtad, tx } = servicio();
      tx.movimientoPuntos.aggregate.mockResolvedValue({ _sum: { puntos: 30 } });
      await expect(lealtad.adquirir('c-1', datos)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('un beneficio inactivo o vencido no se puede canjear', async () => {
      const { lealtad, tx } = servicio();
      tx.beneficio.findFirst.mockResolvedValue(null);
      await expect(lealtad.adquirir('c-1', datos)).rejects.toThrow(
        'El beneficio no está disponible: está inactivo o vencido.',
      );
    });
  });

  describe('H19 mis cupones', () => {
    it('trae el estado de cada cupón', async () => {
      const { lealtad, prisma } = servicio();
      prisma.canje.findMany.mockResolvedValue([
        canje(),
        canje({ id: 45, utilizadoEn: ahora }),
        canje({
          id: 46,
          beneficio: {
            id: 12,
            nombre: 'Limonada',
            vigenteHasta: new Date('2026-11-01T00:00:00Z'),
          },
        }),
      ]);
      const cupones = await lealtad.misCupones('c-1');
      expect(cupones.map((c) => c.estado)).toEqual([
        'PENDIENTE',
        'UTILIZADO',
        'EXPIRADO',
      ]);
      expect(prisma.canje.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clienteId: 'c-1' } }),
      );
    });
  });

  describe('verificar y utilizar cupones', () => {
    it('404 si el código no existe', async () => {
      const { lealtad, prisma } = servicio();
      prisma.canje.findUnique.mockResolvedValue(null);
      await expect(lealtad.verificar('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('marca el cupón como utilizado una sola vez', async () => {
      const { lealtad, tx } = servicio();
      tx.canje.findUnique.mockResolvedValue(canje());
      const cupon = await lealtad.utilizar('abc123');
      expect(cupon.estado).toBe('UTILIZADO');
      expect(tx.canje.update).toHaveBeenCalledWith({
        where: { id: 44 },
        data: { utilizadoEn: ahora },
      });

      tx.canje.findUnique.mockResolvedValue(canje({ utilizadoEn: ahora }));
      await expect(lealtad.utilizar('abc123')).rejects.toThrow(
        'El cupón ya fue utilizado.',
      );
    });

    it('410 si terminó la vigencia del beneficio', async () => {
      const { lealtad, tx } = servicio();
      tx.canje.findUnique.mockResolvedValue(
        canje({
          beneficio: { id: 12, nombre: 'Limonada', vigenteHasta: ahora },
        }),
      );
      await expect(lealtad.utilizar('abc123')).rejects.toBeInstanceOf(
        GoneException,
      );
    });
  });

  describe('H20 administración', () => {
    it('crea la primera regla y reutiliza la misma al repetir la tasa', async () => {
      const { lealtad, tx } = servicio();
      const datos = { puntosPorDolar: 3, vigenteDesde: ahora, creadaEn: ahora };
      const regla = { id: 1, activa: true, ...datos };
      tx.reglaPuntos.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue(regla);
      tx.reglaPuntos.create.mockResolvedValue(regla);

      await expect(lealtad.configurarRegla('g-1', 3)).resolves.toEqual(regla);
      await expect(lealtad.configurarRegla('g-1', 3)).resolves.toEqual(regla);

      expect(tx.reglaPuntos.create).toHaveBeenCalledExactlyOnceWith({
        data: datos,
      });
      expect(tx.historialLealtad.create).toHaveBeenCalledExactlyOnceWith({
        data: {
          usuarioId: 'g-1',
          entidad: 'REGLA',
          entidadId: regla.id,
          accion: 'CREACION',
          valorAnterior: Prisma.DbNull,
          valorNuevo: regla,
        },
      });
    });

    it('deshabilita la regla vigente y guarda el historial', async () => {
      const { lealtad, tx } = servicio();
      await lealtad.deshabilitarRegla('g-1');
      expect(tx.reglaPuntos.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { activa: false, modificadaEn: ahora, deshabilitadaEn: ahora },
      });
      expect(tx.historialLealtad.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ accion: 'DESHABILITACION' }),
      });
    });

    it('404 si no hay regla vigente para deshabilitar', async () => {
      const { lealtad, tx } = servicio();
      tx.reglaPuntos.findFirst.mockResolvedValue(null);
      await expect(lealtad.deshabilitarRegla('g-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('un id fuera de rango responde 404', async () => {
      const { lealtad } = servicio();
      await expect(
        lealtad.editarBeneficio('g-1', 2_147_483_648, null),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
