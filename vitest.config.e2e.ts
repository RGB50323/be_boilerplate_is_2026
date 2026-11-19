import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Las pruebas e2e crean y borran datos (deleteMany), así que corren contra
// LOCAL_DATABASE_URL y nunca contra la base compartida de Supabase.
const testDatabaseUrl = process.env.LOCAL_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'Falta LOCAL_DATABASE_URL. Las pruebas e2e borran datos: apuntala al Postgres local de Docker (ver .env.example).',
  );
}
if (/supabase\.(com|co)/i.test(testDatabaseUrl)) {
  throw new Error(
    'LOCAL_DATABASE_URL apunta a Supabase. Las pruebas e2e borran datos y no pueden correr contra la base compartida.',
  );
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Las variables ya definidas en process.env tienen prioridad sobre .env
    // en ConfigModule, así que la app de prueba se conecta a esta base.
    env: { DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
  },
});
