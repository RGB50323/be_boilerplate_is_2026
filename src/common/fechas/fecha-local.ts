const fechaLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
});

export function formatearFechaLocal(fecha: Date): string {
  return fechaLocal.format(fecha);
}
