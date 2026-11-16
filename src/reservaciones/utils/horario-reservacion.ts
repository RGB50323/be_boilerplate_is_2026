import { BadRequestException } from '@nestjs/common';

export const DURACION_MINUTOS = 120;
export const diaDeReserva = (fecha: string) =>
  new Date(`${fecha}T00:00:00Z`).getUTCDay();

/** H09 y H10 comparten la duración y el horario local de El Salvador. */
export function validarHorarioReservacion(
  fecha: string,
  hora: string,
  horario?: { apertura: Date; cierre: Date },
) {
  const inicio = new Date(`${fecha}T${hora}:00-06:00`);
  const fin = new Date(inicio.getTime() + DURACION_MINUTOS * 60_000);
  const rechazar = (message: string, campos: string[]): never => {
    throw new BadRequestException({
      statusCode: 400,
      message,
      errores: Object.fromEntries(campos.map((campo) => [campo, message])),
    });
  };
  if (inicio.getTime() < Date.now()) {
    rechazar(
      'Horario no válido: la fecha y hora no pueden estar en el pasado.',
      ['fecha', 'hora'],
    );
  }
  if (!horario) {
    return rechazar(
      'Horario no válido: la sucursal no atiende en la fecha solicitada.',
      ['fecha'],
    );
  }
  const [horas, minutos] = hora.split(':').map(Number);
  const inicioMinutos = horas * 60 + minutos;
  const apertura =
    horario.apertura.getUTCHours() * 60 + horario.apertura.getUTCMinutes();
  const cierre =
    horario.cierre.getUTCHours() * 60 + horario.cierre.getUTCMinutes();
  if (inicioMinutos < apertura || inicioMinutos + DURACION_MINUTOS > cierre) {
    rechazar(
      'Horario no válido: elegí una hora que permita las 2 horas completas dentro del horario de atención.',
      ['hora'],
    );
  }
  return { inicio, fin };
}
