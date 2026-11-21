import type { EstadoReservacion } from '@PrismaClient';

type ReservaResumen = {
  id: number;
  estado: EstadoReservacion;
  mesaId: number;
  inicio: Date;
  personas: number;
  mesa: { numero: number; sucursalId: number; sucursal: { nombre: string } };
};
export function resumenReservacion(reserva: ReservaResumen) {
  const local = new Date(
    reserva.inicio.getTime() - 6 * 60 * 60_000,
  ).toISOString();
  return {
    reservacionId: 'R-' + String(reserva.id).padStart(6, '0'),
    estado: reserva.estado,
    mesaId: reserva.mesaId,
    mesa: reserva.mesa.numero,
    sucursalId: reserva.mesa.sucursalId,
    sucursal: reserva.mesa.sucursal.nombre,
    fecha: local.slice(0, 10),
    hora: local.slice(11, 16),
    personas: reserva.personas,
  };
}
export function horarioRespuesta(horario: {
  diaSemana: number;
  apertura: Date;
  cierre: Date;
}) {
  return {
    diaSemana: horario.diaSemana,
    apertura: horario.apertura.toISOString().slice(11, 16),
    cierre: horario.cierre.toISOString().slice(11, 16),
  };
}
export function mesaDisponibleRespuesta({
  id,
  ...mesa
}: {
  id: number;
  numero: number;
  capacidad: number;
  zona: string | null;
}) {
  return { mesaId: id, ...mesa };
}
