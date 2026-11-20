import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoBeneficio } from '../dto/beneficio.dto.js';
import type {
  BeneficioConPlatillo,
  BeneficiosRepository,
} from '../repositories/beneficios.repository.js';
import { BeneficiosService } from './beneficios.service.js';
import { limiteVigencia, ultimoDiaIncluido } from './vigencia.js';

describe('BeneficiosService', () => {
  const dto = {
    platilloId: 15,
    costoPuntos: 150,
    vigenteDesde: '2026-11-25',
    vigenteHasta: '2026-11-30',
  };
  const inicio = new Date('2026-11-25T06:00:00.000Z');
  const fin = new Date('2026-12-01T06:00:00.000Z');
  const registro: BeneficioConPlatillo = {
    id: 1,
    platilloId: 15,
    costoPuntos: 150,
    vigenteDesde: inicio,
    vigenteHasta: fin,
    modificadoEn: null,
    deshabilitadoEn: null,
    creadoEn: inicio,
    platillo: { id: 15, nombre: 'Hamburguesa', descripcion: 'Clásica' },
  };
  const repo = {
    crear: vi.fn(),
    obtener: vi.fn(),
    modificar: vi.fn(),
    existePlatillo: vi.fn(),
  };
  const servicio = new BeneficiosService(
    repo as unknown as BeneficiosRepository,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    repo.existePlatillo.mockResolvedValue(true);
    repo.crear.mockResolvedValue(registro);
    repo.modificar.mockImplementation(
      (
        _id,
        preparar: (
          actual: BeneficioConPlatillo,
        ) => Partial<BeneficioConPlatillo>,
      ) => Promise.resolve({ ...registro, ...preparar(registro) }),
    );
  });

  it('persiste instantes UTC y devuelve los días y la descripción del platillo', async () => {
    await expect(servicio.crear(dto)).resolves.toMatchObject({
      vigenteDesde: dto.vigenteDesde,
      vigenteHasta: dto.vigenteHasta,
      nombre: 'Hamburguesa',
      descripcion: 'Clásica',
    });
    expect(repo.crear).toHaveBeenCalledWith({
      ...dto,
      vigenteDesde: inicio,
      vigenteHasta: fin,
    });
  });

  it('admite un solo día y reconstruye el último día incluido al cruzar de año', async () => {
    await servicio.crear({ ...dto, vigenteHasta: dto.vigenteDesde });
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        vigenteHasta: new Date('2026-11-26T06:00:00.000Z'),
      }),
    );
    expect(ultimoDiaIncluido(limiteVigencia('2026-12-31', true))).toBe(
      '2026-12-31',
    );
  });

  it('rechaza el intervalo invertido y un platillo inexistente', async () => {
    await expect(
      servicio.crear({ ...dto, vigenteHasta: '2026-11-24' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    repo.existePlatillo.mockResolvedValue(false);
    await expect(servicio.crear(dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('valida el intervalo combinado al modificar una sola fecha', async () => {
    await expect(
      servicio.editar(1, { vigenteDesde: '2026-12-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.editar(1, { vigenteHasta: '2026-12-02', costoPuntos: 200 }),
    ).resolves.toMatchObject({
      vigenteDesde: dto.vigenteDesde,
      vigenteHasta: '2026-12-02',
      costoPuntos: 200,
      modificadoEn: expect.any(Date),
    });
  });

  it('rechaza ediciones y bajas repetidas de un registro ya deshabilitado', async () => {
    repo.modificar.mockImplementation(
      (_id, preparar: (actual: BeneficioConPlatillo) => unknown) =>
        preparar({ ...registro, deshabilitadoEn: inicio }),
    );
    await expect(
      servicio.editar(1, { costoPuntos: 200 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(servicio.deshabilitar(1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each([
    ['2026-11-25T05:59:59.999Z', EstadoBeneficio.PROGRAMADO],
    ['2026-11-25T06:00:00.000Z', EstadoBeneficio.VIGENTE],
    ['2026-12-01T05:59:59.999Z', EstadoBeneficio.VIGENTE],
    ['2026-12-01T06:00:00.000Z', EstadoBeneficio.VENCIDO],
  ])('clasifica %s como %s', async (hora, estado) => {
    vi.useFakeTimers().setSystemTime(new Date(hora));
    try {
      repo.obtener.mockResolvedValue(registro);
      await expect(servicio.obtener(1)).resolves.toMatchObject({ estado });
    } finally {
      vi.useRealTimers();
    }
  });
});
