import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@Prisma/services';
import { urlParaCliPrisma, urlParaPruebasE2e } from './destinos-base.js';

// Suite de componente de la historia H35 (plan de pruebas).
// Un it por criterio de aceptación. Los criterios que dependen del panel de
// Supabase o de Heroku (acceso del equipo, Data API apagada, variables del
// backend desplegado) se verifican además con pruebas manuales.

const raiz = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

const SESSION =
  'postgresql://postgres.ref:x@aws-0-us-east-2.pooler.supabase.com:5432/postgres';
const TRANSACTION =
  'postgresql://postgres.ref:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=verify-full';
const LOCAL = 'postgresql://postgres:postgres@localhost:5432/si_be_boilerplate';
const conSupabase = { DATABASE_URL: TRANSACTION, DIRECT_URL: SESSION };

/** Archivos .ts del código de la API (sin pruebas ni código generado). */
function archivosFuente(dir = join(raiz, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory())
      return e.name === 'generated' ? [] : archivosFuente(ruta);
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [ruta] : [];
  });
}

describe('H35. Base de datos compartida en la nube (Supabase)', () => {
  it('AC1: la API no usa la Data API de Supabase, así que puede quedar deshabilitada', () => {
    const usanDataApi = archivosFuente().filter((f) =>
      /\/rest\/v1|supabase\.from\(|@supabase\/supabase-js/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(usanDataApi).toEqual([]);
  });

  it('AC2: migrate deploy usa el session pooler (DIRECT_URL) y las migraciones incluyen btree_gist y la vista venta_confirmada', () => {
    expect(urlParaCliPrisma(['migrate', 'deploy'], conSupabase)).toBe(SESSION);

    const ejemplo = leer('.env.example');
    expect(ejemplo).toMatch(/^DATABASE_URL=.*pooler\.supabase\.com:6543\//m);
    expect(ejemplo).toMatch(/^DIRECT_URL=.*pooler\.supabase\.com:5432\//m);

    const migraciones = readdirSync(join(raiz, 'prisma/migrations'))
      .filter((d) => !d.endsWith('.toml'))
      .map((d) => leer(`prisma/migrations/${d}/migration.sql`))
      .join('\n');
    expect(migraciones).toMatch(
      /CREATE EXTENSION IF NOT EXISTS\s+"?btree_gist"?/i,
    );
    expect(migraciones).toMatch(
      /CREATE (OR REPLACE )?VIEW\s+"?venta_confirmada"?/i,
    );
  });

  it('AC3: el seed corre contra la base compartida sin borrarla y no duplica datos (usa upsert)', () => {
    expect(urlParaCliPrisma(['db', 'seed'], conSupabase)).toBe(SESSION);
    const seed = leer('prisma/seed.ts');
    expect(seed).toContain('.upsert(');
    expect(seed).not.toMatch(/TRUNCATE|DROP TABLE/i);
  });

  it('AC4: la API se conecta a la URL de DATABASE_URL, la misma para todos los integrantes', () => {
    const get = vi.fn((clave: string) =>
      clave === 'DATABASE_URL' ? TRANSACTION : 'test',
    );
    new PrismaService({ get } as unknown as ConfigService<never, true>);
    expect(get.mock.calls.map(([clave]) => clave)).toContain('DATABASE_URL');
    expect(
      get.mock.results[get.mock.calls.findIndex(([c]) => c === 'DATABASE_URL')]
        .value,
    ).toBe(TRANSACTION);
  });

  it('AC5: el despliegue aplica las migraciones con migrate deploy e incluye el certificado de Supabase', () => {
    expect(leer('heroku.yml')).toMatch(
      /release:[\s\S]*npx prisma migrate deploy/,
    );
    expect(leer('Dockerfile')).toContain(
      'COPY --from=builder /app/certs ./certs',
    );
    expect(leer('certs/supabase-ca.crt')).toContain(
      '-----BEGIN CERTIFICATE-----',
    );
    expect(leer('.env.example')).toMatch(
      /^DATABASE_URL=.*sslmode=verify-full&sslrootcert=certs\/supabase-ca\.crt$/m,
    );
  });

  it('AC6: las pruebas e2e no arrancan si la base apunta a Supabase o no hay base local', () => {
    expect(() =>
      urlParaPruebasE2e({ LOCAL_DATABASE_URL: TRANSACTION }),
    ).toThrow(/no apunta a un Postgres local/);
    expect(() => urlParaPruebasE2e({ DATABASE_URL: TRANSACTION })).toThrow(
      /Falta LOCAL_DATABASE_URL/,
    );
    expect(urlParaPruebasE2e({ LOCAL_DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it('AC7: no hay contraseñas reales en el repositorio: .env se ignora y .env.example solo trae marcadores', () => {
    expect(leer('.gitignore')).toMatch(/^\.env$/m);
    const urls =
      leer('.env.example').match(/^(DATABASE_URL|DIRECT_URL)=.*$/gm) ?? [];
    expect(urls).toHaveLength(2);
    for (const linea of urls) {
      expect(linea).toContain(':[PASSWORD]@');
    }
  });

  it('AC8: la documentación explica la conexión y los comandos que no se corren contra la base compartida, y el CLI los bloquea', () => {
    // Desde la documentación 1.0.0 esto vive en docs/, no en el README.
    const instalacion = leer('docs/05-instalacion-local.md');
    const arquitectura = leer('docs/02-arquitectura.md');
    expect(instalacion).toContain('## Variables de entorno');
    for (const variable of [
      'DATABASE_URL',
      'DIRECT_URL',
      'LOCAL_DATABASE_URL',
    ]) {
      expect(instalacion).toContain(variable);
    }
    expect(instalacion).toContain('db:reset');
    for (const comando of ['migrate dev', 'migrate reset']) {
      expect(arquitectura).toContain(comando);
    }
    expect(() =>
      urlParaCliPrisma(['migrate', 'reset', '--force'], conSupabase),
    ).toThrow(/solo corre contra la base local/);
  });
});
