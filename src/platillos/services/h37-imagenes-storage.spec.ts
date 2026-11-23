import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import {
  BadRequestException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../../config/env.validation.js';
import { PlatillosModule } from '../platillos.module.js';
import { ALMACEN_IMAGENES } from './almacen-imagenes.js';
import { AlmacenImagenesLocal } from './almacen-imagenes-local.js';
import { AlmacenImagenesSupabase } from './almacen-imagenes-supabase.js';
import { ImagenesPlatilloService } from './imagenes-platillo.service.js';

// H37. Imágenes de platillos en Supabase Storage.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

function almacenDelModulo(config: Record<string, string>) {
  const providers = Reflect.getMetadata('providers', PlatillosModule) as {
    provide?: unknown;
    useFactory?: (c: unknown) => unknown;
  }[];
  const proveedor = providers.find((p) => p.provide === ALMACEN_IMAGENES);
  return proveedor!.useFactory!({
    get: (clave: string) => config[clave] ?? '',
  });
}

describe('H37. Imágenes de platillos en Supabase Storage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock
      .mockReset()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('AC1: con SUPABASE_URL y SUPABASE_SECRET_KEY la imagen va al bucket y se devuelve la URL pública', async () => {
    const almacen = almacenDelModulo({
      SUPABASE_URL: 'https://proyecto.supabase.co',
      SUPABASE_SECRET_KEY: 'clave',
      SUPABASE_BUCKET_PLATILLOS: 'platillos',
    });
    expect(almacen).toBeInstanceOf(AlmacenImagenesSupabase);

    const { imagenUrl } = await new ImagenesPlatilloService(
      almacen as never,
    ).guardar({
      buffer: PNG,
      size: PNG.length,
    });

    expect(imagenUrl).toMatch(
      /^https:\/\/proyecto\.supabase\.co\/storage\/v1\/object\/public\/platillos\/[0-9a-f-]+\.png$/,
    );
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe(
      'image/png',
    );
  });

  it('AC2: sin esas variables la imagen se guarda en uploads/platillos del servidor', () => {
    const almacen = almacenDelModulo({});
    expect(almacen).toBeInstanceOf(AlmacenImagenesLocal);
    expect(
      readFileSync('src/platillos/services/almacen-imagenes-local.ts', 'utf8'),
    ).toContain("'uploads', 'platillos'");
  });

  it('AC3: con una sola variable o una URL que no es http(s) el backend no inicia y explica el error', () => {
    expect(() =>
      validateEnv({ ...base, SUPABASE_URL: 'https://proyecto.supabase.co' }),
    ).toThrow(/SUPABASE_URL y SUPABASE_SECRET_KEY van juntas/);
    expect(() =>
      validateEnv({ ...base, SUPABASE_SECRET_KEY: 'clave' }),
    ).toThrow(/van juntas/);
    expect(() =>
      validateEnv({
        ...base,
        SUPABASE_URL: 'ftp://proyecto',
        SUPABASE_SECRET_KEY: 'clave',
      }),
    ).toThrow('SUPABASE_URL debe ser la URL http(s) del proyecto de Supabase.');
  });

  it('AC4: si Supabase Storage falla responde 503 y deja el error en el log', async () => {
    fetchMock.mockResolvedValue(new Response('caído', { status: 500 }));
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const almacen = new AlmacenImagenesSupabase({
      url: 'https://p.supabase.co',
      clave: 'c',
      bucket: 'platillos',
    });

    await expect(
      new ImagenesPlatilloService(almacen).guardar({
        buffer: PNG,
        size: PNG.length,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('AC5: se mantienen las validaciones: 400 sin archivo, 413 sobre 2 MB y 415 si no es JPG ni PNG', async () => {
    const service = new ImagenesPlatilloService(new AlmacenImagenesLocal());

    await expect(service.guardar(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.guardar({ buffer: PNG, size: 2 * 1024 * 1024 + 1 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(
      service.guardar({ buffer: Buffer.from('GIF89a'), size: 6 }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('AC6: la clave secreta solo se configura en el backend y no está en el repositorio', () => {
    const ejemplo = readFileSync('.env.example', 'utf8');
    expect(ejemplo).toMatch(/^# SUPABASE_SECRET_KEY=$/m);
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.env$/m);
  });
});
