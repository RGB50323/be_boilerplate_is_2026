export function origenesPermitidos(): string[] | boolean {
  const lista = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return lista.length > 0 ? lista : true;
}