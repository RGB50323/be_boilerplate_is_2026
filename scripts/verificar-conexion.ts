// Verifica la conexión de la API a la base (DATABASE_URL) sin mostrar la contraseña.
// Uso: npm run db:verificar
import 'dotenv/config';
import type { TLSSocket } from 'node:tls';
import pg from 'pg';
import { esDestinoLocal } from '../prisma/destinos-base.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL en el .env.');

const destino = new URL(url);
const ssl = destino.searchParams.get('sslmode') ?? '(sin sslmode)';
console.log(
  `Destino:         ${destino.hostname}:${destino.port || 5432}${destino.pathname}`,
);
console.log(`sslmode:         ${ssl}`);

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

// `pg` no expone el socket en sus tipos; con SSL es un TLSSocket.
const socket = (
  cliente as unknown as { connection: { stream: Partial<TLSSocket> } }
).connection.stream;
const cifrada = socket.encrypted === true;
const certificadoValidado = cifrada && socket.authorized === true;
const emisor = cifrada ? socket.getPeerCertificate?.().issuer?.CN : undefined;

console.log(
  `Cifrada (TLS):   ${cifrada ? `sí, ${socket.getProtocol?.()}` : 'no'}`,
);
console.log(
  `Certificado:     ${certificadoValidado ? `validado (emisor: ${emisor})` : 'NO validado'}`,
);

const { rows: servidor } = await cliente.query<{ version: string }>(
  "SELECT split_part(version(), ' on ', 1) AS version",
);
const { rows: migraciones } = await cliente.query<{
  total: number;
  ultima: string;
}>(
  `SELECT count(*)::int AS total, max(migration_name) AS ultima
     FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
);
console.log(`Servidor:        ${servidor[0].version}`);
console.log(
  `Migraciones:     ${migraciones[0].total} aplicadas (última: ${migraciones[0].ultima})`,
);
await cliente.end();

if (!esDestinoLocal(url) && !certificadoValidado) {
  console.error(
    'La base es remota y la conexión no valida el certificado. Usá sslmode=verify-full con sslrootcert (ver certs/README.md).',
  );
  process.exit(1);
}
