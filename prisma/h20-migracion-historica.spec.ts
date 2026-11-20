import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { esDestinoLocal } from './destinos-base.js';

const url = process.env.H20_TEST_DATABASE_URL;
const primera = '20261120120000_h20_relacion_beneficio_platillo';
const segunda = '20261120120100_h20_vigencia_y_baja_beneficio';
const migraciones = new URL('./migrations/', import.meta.url);

async function aplicar(db: Client, nombre: string) {
  const sql = await readFile(new URL(`${nombre}/migration.sql`, migraciones), 'utf8');
  await db.query(sql);
}

it.skipIf(!url)('H20 conserva históricos y permite reintentar la vigencia tras sanear los datos', async () => {
  if (!url || !esDestinoLocal(url) || new URL(url).pathname !== '/h20_test') {
    throw new Error('H20_TEST_DATABASE_URL debe apuntar a h20_test en PostgreSQL local.');
  }

  const db = new Client({ connectionString: url });
  const esquema = `"h20_legacy_${randomUUID().replaceAll('-', '')}"`;
  let creado = false;

  try {
    await db.connect();
    await db.query(`CREATE SCHEMA ${esquema}`);
    creado = true;
    await db.query(`SET search_path TO ${esquema}, public`);
    const directorios = await readdir(migraciones, { withFileTypes: true });
    for (const nombre of directorios.filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      if (nombre >= primera) break;
      await aplicar(db, nombre);
    }

    const cliente = randomUUID();
    await db.query(
      "INSERT INTO users (id, email, password_hash, updated_at) VALUES ($1, $2, 'fixture', now())",
      [cliente, `${cliente}@example.test`],
    );
    await db.query(`
      INSERT INTO categoria (id, nombre) VALUES (10, 'Histórico');
      INSERT INTO platillo (id, categoria_id, nombre, actualizado_en)
        VALUES (10, 10, 'Sin correspondencia', now());
      INSERT INTO beneficio
        (id, nombre, descripcion, costo_puntos, activo, vigente_desde, vigente_hasta)
      VALUES
        (101, 'Activo', NULL, 100, true, '2026-11-20 06:00', '2026-11-21 06:00'),
        (102, 'Inactivo', 'Baja anterior', 120, false, '2026-11-20 06:00', '2026-11-21 06:00'),
        (103, 'Nombre del canje', NULL, 150, true, '2026-11-20 06:00', '2026-11-21 06:00'),
        (104, 'Sin fechas', NULL, 160, true, NULL, NULL),
        (105, 'Intervalo vacío', NULL, 170, true, '2026-11-20 06:00', '2026-11-20 06:00'),
        (106, 'Sin correspondencia', NULL, 180, true, '2026-11-20 06:00', '2026-11-21 06:00')
    `);
    await db.query(
      "INSERT INTO canje (id, cliente_id, beneficio_id, codigo, puntos_usados) VALUES (201, $1, 103, 'LEGACY-201', 150)",
      [cliente],
    );

    await aplicar(db, primera);
    const consultarBeneficios = async () => (await db.query(
      'SELECT id, platillo_id, deshabilitado_en FROM beneficio ORDER BY id',
    )).rows;
    const consultarCanjes = async () => (await db.query(
      'SELECT id, beneficio_id, nombre_beneficio, puntos_usados FROM canje ORDER BY id',
    )).rows;
    const ids = [101, 102, 103, 104, 105, 106];
    const historico = { id: 201, beneficio_id: 103, nombre_beneficio: 'Nombre del canje', puntos_usados: 150 };
    expect(await consultarBeneficios()).toEqual(
      ids.map((id) => ({ id, platillo_id: null, deshabilitado_en: null })),
    );
    expect(await consultarCanjes()).toEqual([historico]);

    // El CHECK anterior admite extremos iguales, que forman un intervalo vacío en H20.
    const rechazarSegunda = async (bloqueantes: number) => {
      const antes = await db.query('SELECT * FROM beneficio ORDER BY id');
      const canjesAntes = await consultarCanjes();
      await expect(aplicar(db, segunda)).rejects.toMatchObject({
        code: 'P0001',
        message: `H20: ${bloqueantes} beneficios tienen vigencia incompleta o sin duración`,
      });
      await db.query('ROLLBACK');
      expect((await db.query('SELECT * FROM beneficio ORDER BY id')).rows).toEqual(antes.rows);
      expect(await consultarCanjes()).toEqual(canjesAntes);
    };
    await rechazarSegunda(2);
    await db.query(`
      UPDATE beneficio SET vigente_desde = '2026-11-20 06:00',
        vigente_hasta = '2026-11-21 06:00' WHERE id = 104
    `);
    await rechazarSegunda(1);
    await db.query("UPDATE beneficio SET vigente_hasta = '2026-11-21 06:00' WHERE id = 105");
    await aplicar(db, segunda);

    const finales = await consultarBeneficios();
    expect(finales.map(({ id, platillo_id }) => ({ id, platillo_id })))
      .toEqual(ids.map((id) => ({ id, platillo_id: null })));
    expect(finales.find(({ id }) => id === 102)?.deshabilitado_en).toBeInstanceOf(Date);
    expect(finales.filter(({ deshabilitado_en }) => deshabilitado_en !== null)).toHaveLength(1);
    expect(await consultarCanjes()).toEqual([historico]);

    const columnas = await db.query(`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'beneficio'
    `);
    expect(columnas.rows).toEqual(expect.arrayContaining([
      { column_name: 'vigente_desde', is_nullable: 'NO' },
      { column_name: 'vigente_hasta', is_nullable: 'NO' },
      { column_name: 'platillo_id', is_nullable: 'YES' },
    ]));
    expect(columnas.rows.filter(({ column_name }) =>
      ['nombre', 'descripcion', 'activo'].includes(column_name))).toEqual([]);
    await expect(db.query('UPDATE beneficio SET vigente_hasta = vigente_desde WHERE id = 101'))
      .rejects.toMatchObject({ code: '23514', constraint: 'beneficio_vigencia_chk' });
    await expect(db.query('UPDATE beneficio SET platillo_id = -1 WHERE id = 101'))
      .rejects.toMatchObject({ code: '23503', constraint: 'beneficio_platillo_id_fkey' });
  } finally {
    try {
      if (creado) {
        await db.query('ROLLBACK');
        await db.query(`DROP SCHEMA ${esquema} CASCADE`);
      }
    } finally {
      await db.end();
    }
  }
}, 30_000);
