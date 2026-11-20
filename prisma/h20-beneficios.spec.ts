import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { esDestinoLocal } from './destinos-base.js';

const url = process.env.H20_TEST_DATABASE_URL;
const vigencia = ['2026-11-20T06:00:00', '2026-11-21T06:00:00'];

async function probar(operacion: (db: Client) => Promise<void>) {
  if (!url || !esDestinoLocal(url) || new URL(url).pathname !== '/h20_test') {
    throw new Error('H20_TEST_DATABASE_URL debe apuntar a h20_test en PostgreSQL local.');
  }

  const db = new Client({ connectionString: url });
  try {
    await db.connect();
    await db.query('BEGIN');
    await db.query('SET LOCAL search_path TO public');
    await operacion(db);
  } finally {
    try {
      await db.query('ROLLBACK');
    } finally {
      await db.end();
    }
  }
}

it.skipIf(!url)('H20 acepta un día completo y rechaza vigencias incompletas o vacías', async () => {
  await probar(async (db) => {
    const insertar = (desde: string | null, hasta: string | null) =>
      db.query(
        'INSERT INTO beneficio (costo_puntos, vigente_desde, vigente_hasta) VALUES (150, $1, $2) RETURNING platillo_id',
        [desde, hasta],
      );

    const beneficio = await insertar(vigencia[0]!, vigencia[1]!);
    expect(beneficio.rows).toEqual([{ platillo_id: null }]);

    const casos = [
      { desde: null, hasta: vigencia[1]!, code: '23502' },
      { desde: vigencia[0]!, hasta: null, code: '23502' },
      { desde: vigencia[1]!, hasta: vigencia[0]!, code: '23514' },
      { desde: vigencia[0]!, hasta: vigencia[0]!, code: '23514' },
    ];
    for (const { desde, hasta, code } of casos) {
      await db.query('SAVEPOINT vigencia_invalida');
      await expect(insertar(desde, hasta)).rejects.toMatchObject({ code });
      await db.query('ROLLBACK TO SAVEPOINT vigencia_invalida');
      await db.query('RELEASE SAVEPOINT vigencia_invalida');
    }
  });
});

it.skipIf(!url)('H20 desvincula el platillo y conserva el historial del canje', async () => {
  await probar(async (db) => {
    const clienteId = randomUUID();
    await db.query(
      "INSERT INTO users (id, email, password_hash, updated_at) VALUES ($1, $2, 'fixture', now())",
      [clienteId, `${clienteId}@example.test`],
    );
    const categoria = await db.query("INSERT INTO categoria (nombre) VALUES ('H20 Prueba') RETURNING id");
    const platillo = await db.query(
      "INSERT INTO platillo (categoria_id, nombre, actualizado_en) VALUES ($1, 'Hamburguesa clásica', now()) RETURNING id",
      [categoria.rows[0].id],
    );
    const platilloId = platillo.rows[0].id;
    const beneficio = await db.query(
      'INSERT INTO beneficio (platillo_id, costo_puntos, vigente_desde, vigente_hasta) VALUES ($1, 150, $2, $3) RETURNING id',
      [platilloId, ...vigencia],
    );
    const beneficioId = beneficio.rows[0].id;
    const canje = await db.query(
      "INSERT INTO canje (cliente_id, beneficio_id, nombre_beneficio, codigo, puntos_usados) VALUES ($1, $2, 'Hamburguesa clásica', $3, 150) RETURNING id",
      [clienteId, beneficioId, randomUUID().slice(0, 20)],
    );

    await db.query("UPDATE platillo SET nombre = 'Hamburguesa nueva' WHERE id = $1", [platilloId]);
    const actual = await db.query(
      'SELECT p.nombre FROM beneficio b JOIN platillo p ON p.id = b.platillo_id WHERE b.id = $1',
      [beneficioId],
    );
    expect(actual.rows).toEqual([{ nombre: 'Hamburguesa nueva' }]);
    await db.query('DELETE FROM platillo WHERE id = $1', [platilloId]);

    const historial = await db.query(
      'SELECT b.id, b.platillo_id, c.nombre_beneficio, c.puntos_usados FROM canje c JOIN beneficio b ON b.id = c.beneficio_id WHERE c.id = $1',
      [canje.rows[0].id],
    );
    expect(historial.rows).toEqual([
      { id: beneficioId, platillo_id: null, nombre_beneficio: 'Hamburguesa clásica', puntos_usados: 150 },
    ]);
    await expect(
      db.query('DELETE FROM beneficio WHERE id = $1', [beneficioId]),
    ).rejects.toMatchObject({ constraint: 'canje_beneficio_id_fkey' });
  });
});

it.skipIf(!url)('H20 conserva las reglas de borrado de pedidos, reseñas y pagos', async () => {
  await probar(async (db) => {
    const reglas = await db.query(
      `SELECT c.conname AS nombre, c.confdeltype AS accion
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.contype = 'f'
       ORDER BY c.conname`,
    );
    expect(reglas.rows).toEqual(expect.arrayContaining([
      { nombre: 'detalle_pedido_platillo_id_fkey', accion: 'r' },
      { nombre: 'resena_platillo_id_fkey', accion: 'r' },
      { nombre: 'platillo_sucursal_platillo_id_fkey', accion: 'c' },
      { nombre: 'movimiento_puntos_canje_id_fkey', accion: 'n' },
      { nombre: 'canje_pedido_id_fkey', accion: 'n' },
      { nombre: 'comprobante_transaccion_id_ticket_id_fkey', accion: 'r' },
    ]));
  });
});

it.skipIf(!url)('H20 permite fijar la baja una vez y preserva su fecha original', async () => {
  await probar(async (db) => {
    const { rows: [primero, segundo] } = await db.query(
      `INSERT INTO beneficio (costo_puntos, vigente_desde, vigente_hasta)
       VALUES (150, $1, $2), (200, $1, $2)
       RETURNING id, deshabilitado_en`,
      vigencia,
    );
    expect(primero.deshabilitado_en).toBeNull();
    expect(segundo.deshabilitado_en).toBeNull();

    await db.query('UPDATE beneficio SET deshabilitado_en = NULL WHERE id = $1', [primero.id]);
    const baja = '2026-11-20 12:00:00';
    await db.query('UPDATE beneficio SET deshabilitado_en = $1 WHERE id = $2', [baja, primero.id]);
    const consultar = () => db.query(
      'SELECT id, costo_puntos, deshabilitado_en::text FROM beneficio WHERE id IN ($1, $2) ORDER BY id',
      [primero.id, segundo.id],
    );
    const trasBaja = [
      { id: primero.id, costo_puntos: 150, deshabilitado_en: baja },
      { id: segundo.id, costo_puntos: 200, deshabilitado_en: null },
    ];

    for (const fecha of [null, '2026-11-20 13:00:00']) {
      await db.query('SAVEPOINT intento_de_baja');
      await expect(db.query(
        'UPDATE beneficio SET deshabilitado_en = $1, costo_puntos = 999 WHERE id = $2',
        [fecha, primero.id],
      )).rejects.toMatchObject({ code: '23514', constraint: 'beneficio_deshabilitado_en_irreversible' });
      await db.query('ROLLBACK TO SAVEPOINT intento_de_baja');
      await db.query('RELEASE SAVEPOINT intento_de_baja');
      expect((await consultar()).rows).toEqual(trasBaja);
    }

    await db.query('UPDATE beneficio SET deshabilitado_en = $1 WHERE id = $2', [baja, primero.id]);
    await db.query('UPDATE beneficio SET costo_puntos = 175 WHERE id = $1', [primero.id]);
    expect((await consultar()).rows).toEqual([
      { ...trasBaja[0], costo_puntos: 175 },
      trasBaja[1],
    ]);
  });
});
