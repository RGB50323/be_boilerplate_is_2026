// Validaciones del destino de la base de datos.
//
// Las usan prisma.config.ts, vitest.config.e2e.ts y la prueba de concurrencia
// H10 para que nada que borre datos llegue a la base compartida de Supabase.
// Vive en prisma/ (y no en src/) porque el Dockerfile copia esta carpeta junto
// con prisma.config.ts en todas sus etapas.

type Entorno = Record<string, string | undefined>;

/** Hosts aceptados como Postgres local (el contenedor de Docker publicado en el host). */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parámetros con los que `pg` reemplaza el host de la URL; con ellos el host visible no es el real. */
const PARAMETROS_DE_HOST = ['host', 'hostaddr'];

/**
 * Pruebas e2e que necesitan una base exclusiva. vitest.config.e2e.ts crea un
 * proyecto por cada una y test/preparar-bases-temporales.ts prepara su base.
 */
export const PRUEBAS_TEMPORALES = {
  h10: {
    base: 'h10_test',
    variable: 'TEST_DATABASE_URL',
    archivo: 'test/reservacion-concurrencia.e2e-spec.ts',
  },
  h11: {
    base: 'h11_test',
    variable: 'TEST_DATABASE_URL',
    archivo: 'test/edicion-reservacion.e2e-spec.ts',
  },
  h17: {
    base: 'h17_test',
    variable: 'PAGOS_TEST_DATABASE_URL',
    archivo: 'test/pagos-ticket-snapshot.e2e-spec.ts',
  },
  h18_h20: {
    base: 'h18_h20_test',
    variable: 'PAGOS_TEST_DATABASE_URL',
    archivo: 'test/pagos-cobro.e2e-spec.ts',
  },
} as const;

export type HistoriaTemporal = keyof typeof PRUEBAS_TEMPORALES;

/** Comandos del CLI de Prisma que pueden borrar datos o ejecutar SQL arbitrario, por grupo. */
const COMANDOS_DESTRUCTIVOS: Record<string, string[]> = {
  migrate: ['dev', 'reset'],
  db: ['push', 'execute'],
};

/** true si la URL es de PostgreSQL y apunta a localhost, 127.0.0.1 o ::1. */
export function esDestinoLocal(url: string | undefined): boolean {
  if (!url) return false;

  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return false;
  }

  if (destino.protocol !== 'postgresql:' && destino.protocol !== 'postgres:') {
    return false;
  }
  if (PARAMETROS_DE_HOST.some((p) => destino.searchParams.has(p))) {
    return false;
  }
  return HOSTS_LOCALES.has(destino.hostname.toLowerCase());
}

/** Devuelve la URL si apunta a un Postgres local; si no, lanza un error que explica por qué. */
export function exigirBaseLocal(
  variable: string,
  url: string | undefined,
  motivo: string,
): string {
  if (!url) {
    throw new Error(
      `Falta ${variable}. ${motivo} Apuntala al Postgres local de Docker (ver .env.example).`,
    );
  }
  if (!esDestinoLocal(url)) {
    throw new Error(
      `${variable} no apunta a un Postgres local (localhost, 127.0.0.1 o ::1). ${motivo}`,
    );
  }
  return url;
}

/**
 * Comando destructivo de Prisma (`migrate dev`, `db push`, …) presente en los
 * argumentos, o null. No depende de la posición: los valores de flags como
 * `--config prisma.config.ts` o `--schema <ruta>` pueden ir antes del comando.
 */
function comandoDestructivo(args: string[]): string | null {
  const palabras = args.filter((arg) => !arg.startsWith('-'));
  for (const [grupo, subcomandos] of Object.entries(COMANDOS_DESTRUCTIVOS)) {
    if (!palabras.includes(grupo)) continue;
    const sub = subcomandos.find((s) => palabras.includes(s));
    if (sub) return `${grupo} ${sub}`;
  }
  return null;
}

export function esComandoDestructivo(args: string[]): boolean {
  return comandoDestructivo(args) !== null;
}

/**
 * URL que usa el CLI de Prisma.
 * - Comandos destructivos: solo LOCAL_DATABASE_URL, y tiene que ser local. Sin respaldo.
 * - El resto (migrate deploy, migrate status, studio, db seed…): DIRECT_URL o DATABASE_URL.
 */
export function urlParaCliPrisma(args: string[], entorno: Entorno): string {
  const destructivo = comandoDestructivo(args);
  if (destructivo) {
    return exigirBaseLocal(
      'LOCAL_DATABASE_URL',
      entorno.LOCAL_DATABASE_URL,
      `"prisma ${destructivo}" puede borrar datos y solo corre contra la base local.`,
    );
  }
  return entorno.DIRECT_URL || entorno.DATABASE_URL || '';
}

/** URL de las pruebas e2e: LOCAL_DATABASE_URL, obligatoria y local. */
export function urlParaPruebasE2e(entorno: Entorno): string {
  return exigirBaseLocal(
    'LOCAL_DATABASE_URL',
    entorno.LOCAL_DATABASE_URL,
    'Las pruebas e2e crean y borran datos.',
  );
}

/**
 * Valida una variable de base temporal opcional (TEST_DATABASE_URL,
 * PAGOS_TEST_DATABASE_URL). Sin valor devuelve undefined; con valor, tiene
 * que ser un Postgres local o lanza error.
 */
export function validarBaseTemporal(
  variable: string,
  url: string | undefined,
): string | undefined {
  if (!url) return undefined;
  return exigirBaseLocal(
    variable,
    url,
    'Las pruebas con base temporal crean y borran datos.',
  );
}

/**
 * URL que usa la prueba de una historia (la fija vitest.config.e2e.ts).
 * - Variable sin definir: undefined, la prueba se omite.
 * - Variable que no es local: error, antes de tocar nada.
 * - Local pero de otra base (por ejemplo h11_test al correr H10): undefined,
 *   para que H10 y H11 puedan compartir TEST_DATABASE_URL sin fallar.
 *   H17 no exige nombre de base.
 */
export function urlPruebaTemporal(
  historia: HistoriaTemporal,
  entorno: Entorno,
): string | undefined {
  const { variable, base } = PRUEBAS_TEMPORALES[historia];
  const url = validarBaseTemporal(variable, entorno[variable]);
  if (!url || variable === 'PAGOS_TEST_DATABASE_URL') return url;
  return new URL(url).pathname === `/${base}` ? url : undefined;
}

/** Misma conexión que `url`, pero hacia la base `base` del mismo servidor. */
export function urlEnOtraBase(url: string, base: string): string {
  const destino = new URL(url);
  destino.pathname = `/${base}`;
  return destino.toString();
}
