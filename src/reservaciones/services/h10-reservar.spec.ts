import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IS_PUBLIC_KEY } from '@Auth/decorators';
import { CrearReservacionDto } from '@Reservaciones/dto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservasClienteController } from '../controllers/reservas-cliente.controller.js';
import { ReservacionesService } from './reservaciones.service.js';

// H10. Reservar una mesa.

const horarios = [
  {
    diaSemana: 1,
    apertura: new Date('1970-01-01T08:00:00Z'),
    cierre: new Date('1970-01-01T21:00:00Z'),
  },
];

const datos = {
  mesaId: 3,
  nombre: 'Ana López',
  telefono: '7777-8888',
  correo: 'ana@example.com',
  fecha: '2026-11-23',
  hora: '19:00',
  personas: 4,
};

const creada = {
  id: 45,
  estado: 'CONFIRMADA',
  mesaId: 3,
  personas: 4,
  inicio: new Date('2026-11-24T01:00:00Z'),
  mesa: { numero: 2, sucursalId: 1, sucursal: { nombre: 'Centro' } },
};

describe('H10. Reservar una mesa', () => {
  const repo = { findMesaConHorario: vi.fn(), crearConfirmada: vi.fn() };
  const avisos = { creada: vi.fn() };
  let service: ReservacionesService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    Object.values(repo).forEach((f) => f.mockReset());
    avisos.creada.mockReset();
    repo.findMesaConHorario.mockResolvedValue({
      id: 3,
      activa: true,
      capacidad: 4,
      sucursalId: 1,
      sucursal: { horarios },
    });
    service = new ReservacionesService(repo as never, avisos as never);
  });

  afterEach(() => vi.useRealTimers());

  it('AC1: la reservación queda Confirmada, ligada al cliente, con identificador, mesa, sucursal, fecha, hora y personas', async () => {
    repo.crearConfirmada.mockResolvedValue(creada);

    const r = await service.crear('cliente-1', datos);

    expect(repo.crearConfirmada.mock.calls[0][0]).toMatchObject({
      clienteId: 'cliente-1',
      mesaId: 3,
    });
    expect(r).toEqual({
      reservacionId: 'R-000045',
      estado: 'CONFIRMADA',
      mesaId: 3,
      mesa: 2,
      sucursalId: 1,
      sucursal: 'Centro',
      fecha: '2026-11-23',
      hora: '19:00',
      personas: 4,
    });
  });

  it('AC2: campos vacíos o teléfono y correo inválidos indican qué campo corregir', async () => {
    const dto = plainToInstance(CrearReservacionDto, {
      ...datos,
      nombre: '',
      telefono: '77778888',
      correo: 'ana@',
    });
    const errores = await validate(dto);

    expect(errores.map((e) => e.property).sort()).toEqual([
      'correo',
      'nombre',
      'telefono',
    ]);
    expect(JSON.stringify(errores)).toContain(
      'Ingresá un teléfono con formato ####-####.',
    );
  });

  it('AC3: no permite más personas que la capacidad ni una fecha u hora pasada', async () => {
    await expect(
      service.crear('cliente-1', { ...datos, personas: 6 }),
    ).rejects.toThrow('Esta mesa admite hasta 4 personas.');
    await expect(
      service.crear('cliente-1', { ...datos, fecha: '2026-11-20' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.crearConfirmada).not.toHaveBeenCalled();
  });

  it('AC4: si la mesa ya se reservó en un horario que se cruza, avisa que ya no está disponible', async () => {
    repo.crearConfirmada.mockResolvedValue(null);

    await expect(service.crear('cliente-1', datos)).rejects.toThrow(
      new ConflictException(
        'La mesa ya no está disponible en ese horario. Elegí otra mesa.',
      ),
    );
    expect(avisos.creada).not.toHaveBeenCalled();
  });

  it('AC5: la inserción usa la restricción sin solape, así que de dos solicitudes simultáneas solo una se confirma', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ id: 45 }])
      .mockResolvedValueOnce([]);
    const tx = {
      $queryRaw: queryRaw,
      reservacion: { findUniqueOrThrow: vi.fn().mockResolvedValue(creada) },
    };
    const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) };
    const { ReservacionRepository } =
      await import('@Reservaciones/repositories');
    const real = new ReservacionRepository(prisma as never);
    const insertar = {
      ...repo,
      crearConfirmada: real.crearConfirmada.bind(real),
    };
    const s = new ReservacionesService(insertar as never, avisos as never);

    const resultados = await Promise.allSettled([
      s.crear('a', datos),
      s.crear('b', datos),
    ]);

    const sql = (
      queryRaw.mock.calls[0][0] as { strings: string[] }
    ).strings.join('?');
    expect(sql).toContain(
      'ON CONFLICT ON CONSTRAINT reservacion_sin_solape DO NOTHING',
    );
    expect(resultados.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
  });

  it('AC6: crear una reservación requiere sesión (la ruta no es pública)', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, ReservasClienteController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        ReservasClienteController.prototype.crear,
      ),
    ).toBeUndefined();
  });
});
