import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Rol, type User } from '@PrismaClient';
import { OcupacionRepository } from '../repositories/ocupacion.repository.js';
import { OcupacionService } from './ocupacion.service.js';

describe('OcupacionService', () => {
  let service: OcupacionService;
  let repository: {
    sucursal: ReturnType<typeof vi.fn>;
    reservaciones: ReturnType<typeof vi.fn>;
  };

  const usuarioGerente: User = {
    id: 'user-1',
    email: 'gerente@restaurante.com',
    nombre: 'Gerente Centro',
    rol: Rol.GERENTE,
    sucursalId: 1,
    telefono: null,
    creadoEn: new Date(),
    modificadoEn: new Date(),
    passwordHash: 'hash',
  };

  beforeEach(() => {
    repository = {
      sucursal: vi.fn(),
      reservaciones: vi.fn(),
    };
    service = new OcupacionService(
      repository as unknown as OcupacionRepository,
    );
  });

  it('rechaza con 403 si el usuario no tiene sucursal asignada', async () => {
    const usuarioSinSucursal = { ...usuarioGerente, sucursalId: null };
    await expect(
      service.consultar(1, '2026-11-20', usuarioSinSucursal),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza con 403 si el usuario intenta consultar otra sucursal', async () => {
    await expect(
      service.consultar(2, '2026-11-20', usuarioGerente),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza con 400 si la fecha no es válida', async () => {
    await expect(
      service.consultar(1, '2026-02-31', usuarioGerente),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza con 404 si la sucursal no existe', async () => {
    repository.sucursal.mockResolvedValue(null);
    await expect(
      service.consultar(1, '2026-11-20', usuarioGerente),
    ).rejects.toThrow(NotFoundException);
  });

  it('devuelve bloques vacíos si la sucursal no atiende ese día', async () => {
    repository.sucursal.mockResolvedValue({
      id: 1,
      nombre: 'Centro',
      _count: { mesas: 10 },
      horarios: [],
    });

    const resultado = await service.consultar(1, '2026-11-20', usuarioGerente);
    expect(resultado).toEqual({
      fecha: '2026-11-20',
      sucursalId: 1,
      sucursal: 'Centro',
      mesasActivas: 10,
      calculable: true,
      bloques: [],
    });
  });

  it('indica calculable: false y porcentaje null si no hay mesas activas', async () => {
    repository.sucursal.mockResolvedValue({
      id: 1,
      nombre: 'Centro',
      _count: { mesas: 0 },
      horarios: [
        {
          apertura: new Date('1970-01-01T08:00:00Z'),
          cierre: new Date('1970-01-01T10:00:00Z'),
        },
      ],
    });
    repository.reservaciones.mockResolvedValue([]);

    const resultado = await service.consultar(1, '2026-11-20', usuarioGerente);
    expect(resultado.mesasActivas).toBe(0);
    expect(resultado.calculable).toBe(false);
    expect(resultado.bloques).toHaveLength(2);
    expect(resultado.bloques[0]?.porcentajeOcupacion).toBeNull();
  });

  it('calcula 0 % de ocupación si no hay reservaciones en el bloque', async () => {
    repository.sucursal.mockResolvedValue({
      id: 1,
      nombre: 'Centro',
      _count: { mesas: 5 },
      horarios: [
        {
          apertura: new Date('1970-01-01T08:00:00Z'),
          cierre: new Date('1970-01-01T09:00:00Z'),
        },
      ],
    });
    repository.reservaciones.mockResolvedValue([]);

    const resultado = await service.consultar(1, '2026-11-20', usuarioGerente);
    expect(resultado.bloques).toEqual([
      {
        horaInicio: '08:00',
        horaFin: '09:00',
        mesasReservadas: 0,
        mesasDisponibles: 5,
        porcentajeOcupacion: 0,
      },
    ]);
  });

  it('calcula ocupación por bloques de una hora sin contar la misma mesa dos veces', async () => {
    repository.sucursal.mockResolvedValue({
      id: 1,
      nombre: 'Centro',
      _count: { mesas: 4 },
      horarios: [
        {
          apertura: new Date('1970-01-01T08:00:00Z'),
          cierre: new Date('1970-01-01T11:00:00Z'),
        },
      ],
    });

    // Reserva 1: Mesa 1 de 08:00 a 10:00
    // Reserva 2: Mesa 1 de 08:30 a 09:30 (misma mesa, no debe duplicarse en el bloque 08-09)
    // Reserva 3: Mesa 2 de 09:00 a 11:00
    repository.reservaciones.mockResolvedValue([
      {
        mesaId: 1,
        inicio: new Date('2026-11-20T08:00:00-06:00'),
        fin: new Date('2026-11-20T10:00:00-06:00'),
      },
      {
        mesaId: 1,
        inicio: new Date('2026-11-20T08:30:00-06:00'),
        fin: new Date('2026-11-20T09:30:00-06:00'),
      },
      {
        mesaId: 2,
        inicio: new Date('2026-11-20T09:00:00-06:00'),
        fin: new Date('2026-11-20T11:00:00-06:00'),
      },
    ]);

    const resultado = await service.consultar(1, '2026-11-20', usuarioGerente);

    expect(resultado.bloques).toHaveLength(3);

    // Bloque 1: 08:00 - 09:00 -> solo mesa 1 reservada (1 de 4 = 25 %)
    expect(resultado.bloques[0]).toEqual({
      horaInicio: '08:00',
      horaFin: '09:00',
      mesasReservadas: 1,
      mesasDisponibles: 3,
      porcentajeOcupacion: 25,
    });

    // Bloque 2: 09:00 - 10:00 -> mesa 1 y mesa 2 reservadas (2 de 4 = 50 %)
    expect(resultado.bloques[1]).toEqual({
      horaInicio: '09:00',
      horaFin: '10:00',
      mesasReservadas: 2,
      mesasDisponibles: 2,
      porcentajeOcupacion: 50,
    });

    // Bloque 3: 10:00 - 11:00 -> solo mesa 2 reservada (1 de 4 = 25 %)
    expect(resultado.bloques[2]).toEqual({
      horaInicio: '10:00',
      horaFin: '11:00',
      mesasReservadas: 1,
      mesasDisponibles: 3,
      porcentajeOcupacion: 25,
    });
  });
});
