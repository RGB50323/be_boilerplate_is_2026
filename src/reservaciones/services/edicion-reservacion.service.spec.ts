import type { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  EdicionReservacionRepository,
  ReservacionRepository,
} from '@Reservaciones/repositories';
import type { AvisosReservacionService } from './avisos-reservacion.service.js';
import { EdicionReservacionService } from './edicion-reservacion.service.js';
import { OcupacionEvento } from '../../ocupacion/events/ocupacion.events.js';

const fechaAnterior = '2099-11-09';
const fechaNueva = '2099-11-10';
const reserva = {
  id: 45,
  estado: 'CONFIRMADA',
  mesaId: 3,
  personas: 2,
  inicio: new Date(`${fechaAnterior}T20:00:00Z`),
  fin: new Date(`${fechaAnterior}T22:00:00Z`),
  creadaEn: new Date('2026-01-01T00:00:00Z'),
  modificadaEn: null,
  mesa: {
    numero: 2,
    sucursalId: 1,
    capacidad: 4,
    sucursal: {
      nombre: 'Centro',
      horarios: Array.from({ length: 7 }, (_, diaSemana) => ({
        diaSemana,
        apertura: new Date('1970-01-01T08:00:00Z'),
        cierre: new Date('1970-01-01T23:00:00Z'),
      })),
    },
  },
};

it('emite ocupación para las fechas anterior y nueva después de editar', async () => {
  const actualizada = {
    ...reserva,
    inicio: new Date(`${fechaNueva}T20:00:00Z`),
    fin: new Date(`${fechaNueva}T22:00:00Z`),
    modificadaEn: new Date('2026-01-02T00:00:00Z'),
  };
  const repository = {
    editar: vi.fn(async (_id, _clienteId, operacion) =>
      operacion(reserva, {}),
    ),
    mesa: vi.fn().mockResolvedValue({
      id: reserva.mesaId,
      activa: true,
      sucursalId: reserva.mesa.sucursalId,
      capacidad: reserva.mesa.capacidad,
    }),
    guardar: vi.fn().mockResolvedValue(actualizada),
  };
  const avisos = {
    registrarModificada: vi.fn().mockResolvedValue([]),
    enviarCorreos: vi.fn(),
  };
  const eventEmitter = { emit: vi.fn() };
  const service = new EdicionReservacionService(
    repository as unknown as EdicionReservacionRepository,
    avisos as unknown as AvisosReservacionService,
    {} as ReservacionRepository,
    eventEmitter as unknown as EventEmitter2,
  );

  await service.modificar('R-000045', 'cliente', {
    fecha: fechaNueva,
    hora: '14:00',
    mesaId: reserva.mesaId,
    personas: reserva.personas,
    version: reserva.creadaEn.toISOString(),
  });

  expect(eventEmitter.emit).toHaveBeenNthCalledWith(
    1,
    OcupacionEvento.RESERVACION_CAMBIADA,
    { sucursalId: reserva.mesa.sucursalId, fecha: fechaAnterior },
  );
  expect(eventEmitter.emit).toHaveBeenNthCalledWith(
    2,
    OcupacionEvento.RESERVACION_CAMBIADA,
    { sucursalId: reserva.mesa.sucursalId, fecha: fechaNueva },
  );
});
