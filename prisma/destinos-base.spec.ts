import {
  esComandoDestructivo,
  esDestinoLocal,
  urlEnOtraBase,
  urlParaCliPrisma,
  urlParaPruebasE2e,
  urlPruebaTemporal,
  validarBaseTemporal,
} from './destinos-base.js';

const LOCAL =
  'postgresql://postgres:postgres@localhost:5432/si_be_boilerplate?schema=public';
const SUPABASE_6543 =
  'postgresql://postgres.abc:secreto@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full';
const SUPABASE_5432 =
  'postgresql://postgres.abc:secreto@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const H10 = 'postgresql://postgres:postgres@localhost:5432/h10_test';

describe('esDestinoLocal', () => {
  it.each([
    LOCAL,
    'postgres://postgres:postgres@127.0.0.1:5432/db',
    'postgresql://postgres:postgres@[::1]:5432/db',
    'postgresql://postgres@LOCALHOST/db',
  ])('acepta %s', (url) => {
    expect(esDestinoLocal(url)).toBe(true);
  });

  it.each([
    ['Supabase transaction pooler', SUPABASE_6543],
    ['Supabase session pooler', SUPABASE_5432],
    [
      'conexión directa de Supabase',
      'postgresql://postgres:x@db.abc.supabase.co:5432/postgres',
    ],
    [
      'host que solo empieza con localhost',
      'postgresql://u:p@localhost.supabase.com/db',
    ],
    ['host del servicio de Compose', 'postgresql://u:p@postgres:5432/db'],
    ['IP de la red local', 'postgresql://u:p@192.168.1.20:5432/db'],
    [
      'host reemplazado con ?host=',
      'postgresql://u:p@localhost/db?host=db.abc.supabase.co',
    ],
    [
      'host reemplazado con ?hostaddr=',
      'postgresql://u:p@localhost/db?hostaddr=10.0.0.5',
    ],
    ['otro protocolo', 'mysql://u:p@localhost/db'],
    ['texto que no es URL', 'no-es-una-url'],
    ['vacía', ''],
    ['sin definir', undefined],
  ])('rechaza %s', (_caso, url) => {
    expect(esDestinoLocal(url)).toBe(false);
  });
});

describe('esComandoDestructivo', () => {
  it.each([
    [['migrate', 'dev']],
    [['migrate', 'dev', '--name', 'agrega_campo']],
    [['migrate', 'reset', '--force']],
    [['db', 'push']],
    [['db', 'execute', '--file', 'x.sql']],
  ])('marca como destructivo %j', (args) => {
    expect(esComandoDestructivo(args)).toBe(true);
  });

  it.each([
    [['migrate', 'deploy']],
    [['migrate', 'status']],
    [['db', 'seed']],
    [['generate']],
    [['studio']],
  ])('no marca %j', (args) => {
    expect(esComandoDestructivo(args)).toBe(false);
  });
});

describe('urlParaCliPrisma', () => {
  const conSupabase = {
    DATABASE_URL: SUPABASE_6543,
    DIRECT_URL: SUPABASE_5432,
    LOCAL_DATABASE_URL: LOCAL,
  };

  it('manda los comandos destructivos a LOCAL_DATABASE_URL', () => {
    expect(urlParaCliPrisma(['migrate', 'dev'], conSupabase)).toBe(LOCAL);
    expect(urlParaCliPrisma(['migrate', 'reset', '--force'], conSupabase)).toBe(
      LOCAL,
    );
  });

  it('exige LOCAL_DATABASE_URL para comandos destructivos, sin usar DIRECT_URL ni DATABASE_URL', () => {
    const sinLocal = { DATABASE_URL: LOCAL, DIRECT_URL: LOCAL };
    expect(() => urlParaCliPrisma(['migrate', 'dev'], sinLocal)).toThrow(
      /Falta LOCAL_DATABASE_URL/,
    );
  });

  it('rechaza LOCAL_DATABASE_URL si no es local', () => {
    const malConfigurado = {
      ...conSupabase,
      LOCAL_DATABASE_URL: SUPABASE_5432,
    };
    expect(() => urlParaCliPrisma(['db', 'push'], malConfigurado)).toThrow(
      /no apunta a un Postgres local/,
    );
  });

  it('usa DIRECT_URL para los comandos que no borran datos', () => {
    expect(urlParaCliPrisma(['migrate', 'deploy'], conSupabase)).toBe(
      SUPABASE_5432,
    );
    expect(urlParaCliPrisma(['migrate', 'status'], conSupabase)).toBe(
      SUPABASE_5432,
    );
  });

  it('usa DATABASE_URL si no hay DIRECT_URL', () => {
    expect(
      urlParaCliPrisma(['migrate', 'deploy'], { DATABASE_URL: LOCAL }),
    ).toBe(LOCAL);
  });

  it('no exige ninguna URL para generate', () => {
    expect(urlParaCliPrisma(['generate'], {})).toBe('');
  });
});

describe('urlParaPruebasE2e', () => {
  it('devuelve LOCAL_DATABASE_URL si es local', () => {
    expect(urlParaPruebasE2e({ LOCAL_DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it('falla si falta, aunque DATABASE_URL sea local', () => {
    expect(() => urlParaPruebasE2e({ DATABASE_URL: LOCAL })).toThrow(
      /Falta LOCAL_DATABASE_URL/,
    );
  });

  it('falla si apunta a Supabase', () => {
    expect(() =>
      urlParaPruebasE2e({ LOCAL_DATABASE_URL: SUPABASE_6543 }),
    ).toThrow(/no apunta a un Postgres local/);
  });
});

describe('validarBaseTemporal', () => {
  it('sin valor devuelve undefined (la prueba se omite)', () => {
    expect(validarBaseTemporal('TEST_DATABASE_URL', undefined)).toBeUndefined();
    expect(validarBaseTemporal('TEST_DATABASE_URL', '')).toBeUndefined();
  });

  it('acepta una base local', () => {
    expect(validarBaseTemporal('TEST_DATABASE_URL', H10)).toBe(H10);
  });

  it('rechaza un servidor remoto aunque la base se llame h10_test', () => {
    expect(() =>
      validarBaseTemporal(
        'TEST_DATABASE_URL',
        'postgresql://postgres.abc:x@aws-0-us-east-1.pooler.supabase.com:5432/h10_test',
      ),
    ).toThrow(/TEST_DATABASE_URL no apunta a un Postgres local/);
  });
});

describe('urlPruebaTemporal', () => {
  const H11 = 'postgresql://postgres:postgres@localhost:5432/h11_test';

  it('H10 corre con h10_test y se omite con h11_test', () => {
    expect(urlPruebaTemporal('h10', { TEST_DATABASE_URL: H10 })).toBe(H10);
    expect(
      urlPruebaTemporal('h10', { TEST_DATABASE_URL: H11 }),
    ).toBeUndefined();
  });

  it('H11 corre con h11_test y se omite con h10_test', () => {
    expect(urlPruebaTemporal('h11', { TEST_DATABASE_URL: H11 })).toBe(H11);
    expect(
      urlPruebaTemporal('h11', { TEST_DATABASE_URL: H10 }),
    ).toBeUndefined();
  });

  it('H10 y H11 fallan si TEST_DATABASE_URL apunta a Supabase', () => {
    const remota = { TEST_DATABASE_URL: SUPABASE_5432 };
    expect(() => urlPruebaTemporal('h10', remota)).toThrow(
      /no apunta a un Postgres local/,
    );
    expect(() => urlPruebaTemporal('h11', remota)).toThrow(
      /no apunta a un Postgres local/,
    );
  });

  it('H17 usa PAGOS_TEST_DATABASE_URL y solo exige que sea local', () => {
    const pagos = 'postgresql://postgres:postgres@127.0.0.1:5432/h17_test';
    expect(urlPruebaTemporal('h17', { PAGOS_TEST_DATABASE_URL: pagos })).toBe(
      pagos,
    );
    expect(urlPruebaTemporal('h17', {})).toBeUndefined();
    expect(() =>
      urlPruebaTemporal('h17', { PAGOS_TEST_DATABASE_URL: SUPABASE_6543 }),
    ).toThrow(/PAGOS_TEST_DATABASE_URL no apunta a un Postgres local/);
  });
});

describe('urlEnOtraBase', () => {
  it('cambia solo el nombre de la base', () => {
    expect(urlEnOtraBase(LOCAL, 'h10_test')).toBe(
      'postgresql://postgres:postgres@localhost:5432/h10_test?schema=public',
    );
  });
});
