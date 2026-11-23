import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// H30. Base de datos.
// Revisa el esquema, las migraciones y el seed sin conectarse a ninguna base.
// La ejecución real de prisma:migrate y db:seed se verifica en la prueba de integración.

const raiz = join(import.meta.dirname, '..');
const esquema = readFileSync(join(raiz, 'prisma/schema.prisma'), 'utf8');
const seed = readFileSync(join(raiz, 'prisma/seed.ts'), 'utf8');
const carpetaMigraciones = join(raiz, 'prisma/migrations');
const migraciones = readdirSync(carpetaMigraciones)
  .filter((d) => /^\d{14}_/.test(d))
  .sort()
  .map((d) =>
    readFileSync(join(carpetaMigraciones, d, 'migration.sql'), 'utf8'),
  )
  .join('\n');

const modelo = (nombre: string) => {
  const inicio = esquema.indexOf(`model ${nombre} {`);
  return esquema.slice(inicio, esquema.indexOf('\n}', inicio));
};

function tablasDelEsquema(): Set<string> {
  const tablas = new Set<string>();
  for (const [, nombre, cuerpo] of esquema.matchAll(
    /^model (\w+) \{([\s\S]*?)^\}/gm,
  )) {
    tablas.add(/@@map\("(\w+)"\)/.exec(cuerpo)?.[1] ?? nombre);
  }
  return tablas;
}

function tablasDeLasMigraciones(): Set<string> {
  const tablas = new Set(
    [...migraciones.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/g)].map(
      (m) => m[1],
    ),
  );
  for (const [, antes, despues] of migraciones.matchAll(
    /ALTER TABLE "?(\w+)"? RENAME TO "?(\w+)"?/g,
  )) {
    tablas.delete(antes);
    tablas.add(despues);
  }
  for (const [, tabla] of migraciones.matchAll(
    /DROP TABLE (?:IF EXISTS )?"?(\w+)"?/g,
  ))
    tablas.delete(tabla);
  return tablas;
}

describe('H30. Base de datos', () => {
  it('AC1: las migraciones crean todas las tablas del sistema', () => {
    const faltantes = [...tablasDelEsquema()].filter(
      (t) => !tablasDeLasMigraciones().has(t),
    );
    expect(faltantes).toEqual([]);
    expect(tablasDelEsquema().size).toBeGreaterThanOrEqual(20);
  });

  it('AC2: el seed crea sucursales, categorías, platillos con precio y disponibilidad, y un usuario por rol', () => {
    for (const constante of [
      'const SUCURSALES',
      'const CATEGORIAS',
      'const PLATILLOS',
    ]) {
      expect(seed).toContain(constante);
    }
    expect(seed).toContain('platilloSucursal.upsert');
    for (const rol of [
      'CLIENTE',
      'MESERO',
      'COCINA',
      'GERENTE',
      'GERENTE_GENERAL',
    ]) {
      expect(seed).toContain(`rol: '${rol}'`);
    }
  });

  it('AC3: el seed usa upsert, así que correrlo varias veces no duplica datos', () => {
    for (const tabla of ['sucursal', 'platilloSucursal', 'user', 'mesa']) {
      expect(seed).toContain(`prisma.${tabla}.upsert(`);
    }
    expect(seed).not.toMatch(/\.create\(\{\s*data:\s*\{\s*email/);
  });

  it('AC4: cada usuario tiene un rol de la lista y una sucursal opcional para el personal', () => {
    expect(esquema).toMatch(
      /enum Rol \{\s*CLIENTE\s*MESERO\s*COCINA\s*GERENTE\s*GERENTE_GENERAL/,
    );
    expect(modelo('User')).toMatch(/rol\s+Rol/);
    expect(modelo('User')).toMatch(/sucursalId\s+Int\?/);
  });

  it('AC5: la base rechaza un precio menor o igual a 0 y una disponibilidad negativa', () => {
    expect(migraciones).toContain('CHECK (precio > 0)');
    expect(migraciones).toContain('CHECK (disponibilidad >= 0)');
  });

  it('AC6: la base rechaza repetir la combinación de platillo y sucursal', () => {
    expect(modelo('PlatilloSucursal')).toContain(
      '@@unique([platilloId, sucursalId])',
    );
  });

  it('AC7: las tablas del esquema (base del diagrama) coinciden con las que crean las migraciones', () => {
    expect([...tablasDeLasMigraciones()].sort()).toEqual(
      [...tablasDelEsquema()].sort(),
    );
  });
});
