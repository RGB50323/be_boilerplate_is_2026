import 'dotenv/config';
import { configDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import {
  PRUEBAS_TEMPORALES,
  urlEnOtraBase,
  urlParaPruebasE2e,
} from './prisma/destinos-base.js';

// Las pruebas e2e crean y borran datos (deleteMany): corren contra
// LOCAL_DATABASE_URL, que tiene que ser un Postgres local. Si no, no arrancan.
const urlLocal = urlParaPruebasE2e(process.env);

// H10, H11 y H17 necesitan una base exclusiva. Cada una corre en su propio
// proyecto, con todas las variables de base apuntando a su base temporal
// (h10_test, h11_test, h17_test) en el mismo servidor local.
// Antes de correr, cada uno de esos proyectos crea y migra su base con
// test/preparar-bases-temporales.ts. Un solo `npm run test:e2e` corre todo.
const temporales = Object.entries(PRUEBAS_TEMPORALES);

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    projects: [
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['**/*.e2e-spec.ts'],
          exclude: [
            ...configDefaults.exclude,
            ...temporales.map(([, prueba]) => prueba.archivo),
          ],
          // Las variables ya definidas en process.env tienen prioridad sobre
          // .env en ConfigModule, así que la app de prueba usa esta base.
          env: { DATABASE_URL: urlLocal, DIRECT_URL: urlLocal },
        },
      },
      ...temporales.map(([historia, prueba]) => {
        const url = urlEnOtraBase(urlLocal, prueba.base);
        return {
          extends: true as const,
          test: {
            name: historia,
            include: [prueba.archivo],
            globalSetup: ['./test/preparar-bases-temporales.ts'],
            env: { DATABASE_URL: url, DIRECT_URL: url, [prueba.variable]: url },
          },
        };
      }),
    ],
  },
});
