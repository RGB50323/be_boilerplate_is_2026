const horaLocal = new Intl.DateTimeFormat('es-SV', {
  timeZone: 'America/El_Salvador',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatearHoraLocal(fecha: Date): string {
  return horaLocal.format(fecha);
}
