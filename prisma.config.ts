import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { urlParaCliPrisma } from './prisma/destinos-base.js';

// Configuración del CLI de Prisma (migrate, generate, studio, db seed).
// El runtime de la aplicación no pasa por acá: la conexión se arma en
// src/prisma/prisma.service.ts con el driver adapter PrismaPg.
//
// - migrate dev, migrate reset, db push y db execute pueden borrar datos:
//   solo corren contra LOCAL_DATABASE_URL, que tiene que ser un Postgres local.
// - El resto usa DIRECT_URL (session pooler de Supabase) o, si no existe,
//   DATABASE_URL. El transaction pooler (6543) no sirve para migraciones.
// Las reglas están en prisma/destinos-base.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: urlParaCliPrisma(process.argv.slice(2), process.env),
  },
});
