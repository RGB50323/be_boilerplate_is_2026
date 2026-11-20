// globalSetup de los proyectos h10, h11 y h17 (vitest.config.e2e.ts).
// Antes de que corra cada proyecto, crea su base temporal en el servidor local de LOCAL_DATABASE_URL si no existe y le aplica las migraciones pendientes.
// Mientras corre `prisma migrate deploy`, todas las variables de base apuntan a la base temporal, así que nunca puede llegar a Supabase por DIRECT_URL.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import {
  type HistoriaTemporal,
  PRUEBAS_TEMPORALES,
  urlEnOtraBase,
  urlParaPruebasE2e,
} from '../prisma/destinos-base.js';

async function crearSiFalta(urlLocal: string, base: string): Promise<void> {
  const admin = new pg.Client({
    connectionString: urlEnOtraBase(urlLocal, 'postgres'),
  });
  await admin.connect();
  try {
    const existe = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [base],
    );
    if (existe.rowCount === 0) await admin.query(`CREATE DATABASE ${base}`);
  } finally {
    await admin.end();
  }
}

function migrar(url: string, base: string): void {
  const resultado = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      LOCAL_DATABASE_URL: url,
    },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (resultado.status !== 0) {
    throw new Error(
      `No se pudieron aplicar las migraciones en ${base}:\n${resultado.stdout}${resultado.stderr}`,
    );
  }
}

export default async function prepararBaseTemporal(
  proyecto: TestProject,
): Promise<void> {
  const prueba = PRUEBAS_TEMPORALES[proyecto.name as HistoriaTemporal];
  if (!prueba) throw new Error(`Proyecto sin base temporal: ${proyecto.name}`);

  const urlLocal = urlParaPruebasE2e(process.env);
  await crearSiFalta(urlLocal, prueba.base);
  migrar(urlEnOtraBase(urlLocal, prueba.base), prueba.base);
}
