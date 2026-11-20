import { formatearFechaLocal } from '@Common/fechas';

const DIA_MS = 86_400_000;

export function diaLocal(instante: Date): string {
  const [anio, mes, dia] = formatearFechaLocal(instante).split('-');
  return `${anio.padStart(4, '0')}-${mes}-${dia}`;
}

export function limiteVigencia(dia: string, finExclusivo = false): Date {
  const diaUtc =
    Date.parse(`${dia}T00:00:00.000Z`) + (finExclusivo ? DIA_MS : 0);
  const objetivo = new Date(diaUtc)
    .toISOString()
    .split('T')[0]
    .replace(/^\+/, '');
  const numeroDia = (fecha: string) => Number(fecha.replaceAll('-', ''));
  const diaObjetivo = numeroDia(objetivo);

  // La medianoche salvadoreña cae después de la UTC, con desfases históricos distintos.
  let inicio = diaUtc;
  let fin = diaUtc + DIA_MS;
  while (inicio < fin) {
    const mitad = Math.floor((inicio + fin) / 2);
    const local = numeroDia(diaLocal(new Date(mitad)));
    // Intl sin era rotula el 31 de diciembre anterior al año 1 como 0001-12-31.
    const antesDeLaEra = diaObjetivo === 10101 && local === 11231;
    if (local < diaObjetivo || antesDeLaEra) inicio = mitad + 1;
    else fin = mitad;
  }
  return new Date(inicio);
}

export function ultimoDiaIncluido(finExclusivo: Date): string {
  return diaLocal(new Date(finExclusivo.getTime() - 1));
}
