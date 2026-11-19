import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Configuración del CLI de Prisma (migrate, generate, studio, db seed).
// El runtime de la aplicación no pasa por acá: la conexión se arma en
// src/prisma/prisma.service.ts con el driver adapter PrismaPg.

const esSupabase = (url: string) => /supabase\.(com|co)/i.test(url);

// Comandos que pueden borrar datos: siempre van a la base local de Docker.
const args = process.argv.slice(2);
const comandoDestructivo =
  (args.includes('migrate') &&
    (args.includes('dev') || args.includes('reset'))) ||
  (args.includes('db') && args.includes('push'));

function urlDelCli(): string {
  // Con Supabase, DATABASE_URL es el transaction pooler (6543), que no sirve
  // para migraciones; DIRECT_URL es el session pooler (5432).
  const compartida = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  if (!comandoDestructivo) return compartida;

  const local = process.env.LOCAL_DATABASE_URL;
  if (local && !esSupabase(local)) return local;
  if (compartida && !esSupabase(compartida)) return compartida;

  throw new Error(
    `"prisma ${args.join(' ')}" puede borrar datos y no corre contra la base compartida de Supabase. ` +
      'Definí LOCAL_DATABASE_URL apuntando al Postgres de Docker (ver .env.example).',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: urlDelCli(),
  },
});
