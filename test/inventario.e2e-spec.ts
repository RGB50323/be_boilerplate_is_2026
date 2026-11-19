import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ApiValidationPipe } from '@Common/pipes';
import { PrismaService } from '@Prisma/services';
import type { InsumoResponseDto } from '@Inventario/dto';
import { Rol, TipoMovimientoInsumo, UnidadInsumo } from '@PrismaClient';

describe('Inventario de insumos (e2e)', () => {
  const sufijo = `e2e-h14-${Date.now()}`;
  const PASSWORD = 'E2ePass1234';

  let app: INestApplication;
  let prisma: PrismaService;
  let contador = 0;
  const sucursales = { a: 0, b: 0 };
  const usuarios: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const nombreUnico = (base: string) => `${base} ${sufijo}-${++contador}`;

  async function crearInsumo(
    sucursalId: number,
    datos: { nombre?: string; cantidad?: number; minimo?: number } = {},
  ) {
    return prisma.insumo.create({
      data: {
        sucursalId,
        nombre: datos.nombre ?? nombreUnico('Insumo'),
        unidad: UnidadInsumo.LB,
        cantidad: datos.cantidad ?? 0,
        minimo: datos.minimo ?? 0,
      },
    });
  }

  const listar = (q?: string, token = tokens.gerente) =>
    api()
      .get('/api/v1/inventario/insumos')
      .query(q === undefined ? {} : { q })
      .set('Authorization', `Bearer ${token}`);

  const crear = (body: Record<string, unknown>, token = tokens.gerente) =>
    api().post('/api/v1/inventario/insumos').set('Authorization', `Bearer ${token}`).send(body);

  const mover = (insumoId: number, body: Record<string, unknown>, token = tokens.gerente) =>
    api()
      .post(`/api/v1/inventario/insumos/${insumoId}/movimientos`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const historial = (insumoId: number, pagina?: number, token = tokens.gerente) =>
    api()
      .get(`/api/v1/inventario/insumos/${insumoId}/movimientos`)
      .query(pagina === undefined ? {} : { pagina })
      .set('Authorization', `Bearer ${token}`);

  const cantidadDe = async (insumoId: number) =>
    (await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } })).cantidad.toNumber();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ApiValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);

    const [a, b] = await Promise.all(
      ['A', 'B'].map((n) => prisma.sucursal.create({ data: { nombre: `${sufijo}-${n}` } })),
    );
    sucursales.a = a.id;
    sucursales.b = b.id;

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const roles: Record<string, [Rol, number]> = {
      gerente: [Rol.GERENTE, a.id],
      gerente2: [Rol.GERENTE, a.id],
      gerenteB: [Rol.GERENTE, b.id],
      mesero: [Rol.MESERO, a.id],
    };
    for (const [nombre, [rol, sucursalId]] of Object.entries(roles)) {
      const email = `${nombre.toLowerCase()}.${sufijo}@example.com`;
      const user = await prisma.user.create({
        data: { email, passwordHash, rol, sucursalId, nombre: 'Ana', apellido: nombre },
      });
      usuarios[nombre] = user.id;
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      tokens[nombre] = res.body.accessToken as string;
    }
  });

  afterAll(async () => {
    if (prisma) {
      const ids = [sucursales.a, sucursales.b];
      await prisma.insumo.deleteMany({ where: { sucursalId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: Object.values(usuarios) } } });
      await prisma.sucursal.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  describe('GET /inventario/insumos', () => {
    it('lista solo los insumos de su sucursal y calcula el estado en el límite', async () => {
      const debajo = await crearInsumo(sucursales.a, { nombre: `A debajo ${sufijo}`, cantidad: 9.5, minimo: 10 });
      const igual = await crearInsumo(sucursales.a, { nombre: `B igual ${sufijo}`, cantidad: 10, minimo: 10 });
      const encima = await crearInsumo(sucursales.a, { nombre: `C encima ${sufijo}`, cantidad: 12.5, minimo: 10 });
      const ajeno = await crearInsumo(sucursales.b, { nombre: `D ajeno ${sufijo}`, cantidad: 1, minimo: 10 });

      const res = await listar().expect(200);

      const insumos = res.body as InsumoResponseDto[];
      expect(insumos.map((i) => i.id)).not.toContain(ajeno.id);
      const propios = insumos.filter((i) => [debajo.id, igual.id, encima.id].includes(i.id));
      expect(propios).toEqual([
        { id: debajo.id, nombre: debajo.nombre, unidad: 'lb', cantidad: 9.5, minimo: 10, estado: 'BAJO' },
        expect.objectContaining({ id: igual.id, cantidad: 10, estado: 'BAJO' }),
        expect.objectContaining({ id: encima.id, cantidad: 12.5, estado: 'NORMAL' }),
      ]);
    });

    it('q filtra por parte del nombre sin distinguir mayúsculas', async () => {
      const queso = await crearInsumo(sucursales.a, { nombre: `Queso con loroco ${sufijo}` });
      await crearInsumo(sucursales.a, { nombre: `Frijol ${sufijo}` });
      await crearInsumo(sucursales.b, { nombre: `Queso duro ${sufijo}` });

      const res = await listar(`QUESO CON LOROCO ${sufijo}`).expect(200);

      expect((res.body as InsumoResponseDto[]).map((i) => i.id)).toEqual([queso.id]);
    });

    it('un rol distinto a GERENTE recibe 403 y sin token 401', async () => {
      await listar(undefined, tokens.mesero).expect(403);
      await api().get('/api/v1/inventario/insumos').expect(401);
    });
  });

  describe('POST /inventario/insumos', () => {
    it('crea el insumo en la sucursal del gerente con cantidad 0', async () => {
      const nombre = nombreUnico('Masa de maíz');

      const res = await crear({ nombre, unidad: 'lb', minimo: 20 }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(Number),
        nombre,
        unidad: 'lb',
        cantidad: 0,
        minimo: 20,
        estado: 'BAJO',
      });
      const guardado = await prisma.insumo.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(guardado.sucursalId).toBe(sucursales.a);
      expect(guardado.unidad).toBe(UnidadInsumo.LB);
    });

    it('no acepta la sucursal como parámetro', async () => {
      await crear({ nombre: nombreUnico('Sal'), unidad: 'kg', minimo: 1, sucursalId: sucursales.b }).expect(400);
    });

    it('un nombre duplicado en la sucursal responde 409 aunque cambien las mayúsculas', async () => {
      const nombre = nombreUnico('Harina');
      await crear({ nombre, unidad: 'kg', minimo: 5 }).expect(201);

      await crear({ nombre: nombre.toUpperCase(), unidad: 'kg', minimo: 5 }).expect(409);
    });

    it('el mismo nombre en otra sucursal sí se permite', async () => {
      const nombre = nombreUnico('Azúcar');
      await crear({ nombre, unidad: 'kg', minimo: 5 }).expect(201);

      await crear({ nombre, unidad: 'kg', minimo: 5 }, tokens.gerenteB).expect(201);
    });

    it.each([
      ['nombre vacío', { nombre: '  ', unidad: 'lb', minimo: 1 }, 'nombre'],
      ['unidad vacía', { nombre: 'X', unidad: '', minimo: 1 }, 'unidad'],
      ['unidad no permitida', { nombre: 'X', unidad: 'gr', minimo: 1 }, 'unidad'],
      ['mínimo negativo', { nombre: 'X', unidad: 'lb', minimo: -1 }, 'minimo'],
    ])('%s responde 400', async (_caso, body, campo) => {
      const res = await crear(body).expect(400);

      expect(res.body.errores).toHaveProperty(campo);
    });

    it('un rol distinto a GERENTE recibe 403 y sin token 401', async () => {
      await crear({ nombre: nombreUnico('Sal'), unidad: 'kg', minimo: 1 }, tokens.mesero).expect(403);
      await api().post('/api/v1/inventario/insumos').send({}).expect(401);
    });
  });

  describe('POST /inventario/insumos/:id/movimientos', () => {
    it('una entrada y una salida actualizan la cantidad y guardan usuario, fecha y motivo', async () => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 12.5 });
      const antes = new Date();

      const salida = await mover(id, { tipo: 'SALIDA', cantidad: 3, motivo: 'Uso en cocina' }).expect(201);
      expect(salida.body).toEqual({
        movimientoId: expect.any(Number),
        cantidadAnterior: 12.5,
        cantidadActual: 9.5,
      });

      const entrada = await mover(id, { tipo: 'ENTRADA', cantidad: 0.75, motivo: 'Compra' }).expect(201);
      expect(entrada.body).toMatchObject({ cantidadAnterior: 9.5, cantidadActual: 10.25 });

      expect(await cantidadDe(id)).toBe(10.25);
      const movimiento = await prisma.movimientoInsumo.findUniqueOrThrow({
        where: { id: salida.body.movimientoId },
      });
      expect(movimiento).toMatchObject({
        insumoId: id,
        tipo: TipoMovimientoInsumo.SALIDA,
        motivo: 'Uso en cocina',
        usuarioId: usuarios.gerente,
      });
      expect(movimiento.cantidad.toNumber()).toBe(3);
      expect(movimiento.creadoEn.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000);
    });

    it('una salida mayor a la existencia responde 422 y no cambia la cantidad', async () => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 2 });

      await mover(id, { tipo: 'SALIDA', cantidad: 2.001, motivo: 'Uso en cocina' }).expect(422);

      expect(await cantidadDe(id)).toBe(2);
      expect(await prisma.movimientoInsumo.count({ where: { insumoId: id } })).toBe(0);
    });

    it('dos salidas simultáneas que juntas superan la existencia: una 201 y otra 422', async () => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 10 });

      const respuestas = await Promise.all([
        mover(id, { tipo: 'SALIDA', cantidad: 6, motivo: 'Uso en cocina' }, tokens.gerente),
        mover(id, { tipo: 'SALIDA', cantidad: 6, motivo: 'Uso en cocina' }, tokens.gerente2),
      ]);

      expect(respuestas.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 422]);
      expect(await cantidadDe(id)).toBe(4);
      expect(await prisma.movimientoInsumo.count({ where: { insumoId: id } })).toBe(1);
    });

    it.each([
      ['cantidad 0', { tipo: 'SALIDA', cantidad: 0, motivo: 'X' }, 'cantidad'],
      ['cantidad negativa', { tipo: 'ENTRADA', cantidad: -1, motivo: 'X' }, 'cantidad'],
      ['tipo inválido', { tipo: 'AJUSTE', cantidad: 1, motivo: 'X' }, 'tipo'],
    ])('%s responde 400', async (_caso, body, campo) => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 5 });

      const res = await mover(id, body).expect(400);

      expect(res.body.errores).toHaveProperty(campo);
      expect(await cantidadDe(id)).toBe(5);
    });

    it('un insumo de otra sucursal responde 403 y no se modifica', async () => {
      const { id } = await crearInsumo(sucursales.b, { cantidad: 5 });

      await mover(id, { tipo: 'SALIDA', cantidad: 1, motivo: 'X' }).expect(403);

      expect(await cantidadDe(id)).toBe(5);
    });

    it('un insumo inexistente responde 404', async () => {
      await mover(2_000_000_000, { tipo: 'ENTRADA', cantidad: 1, motivo: 'X' }).expect(404);
      await mover(99_999_999_999, { tipo: 'ENTRADA', cantidad: 1, motivo: 'X' }).expect(404);
    });

    it('un rol distinto a GERENTE recibe 403 y sin token 401', async () => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 5 });

      await mover(id, { tipo: 'SALIDA', cantidad: 1, motivo: 'X' }, tokens.mesero).expect(403);
      await api().post(`/api/v1/inventario/insumos/${id}/movimientos`).send({}).expect(401);
    });
  });

  describe('GET /inventario/insumos/:id/movimientos', () => {
    it('devuelve el historial paginado del más reciente al más antiguo', async () => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 100 });
      const base = Date.parse('2026-11-17T15:00:00.000Z');
      await prisma.movimientoInsumo.createMany({
        data: Array.from({ length: 12 }, (_, i) => ({
          insumoId: id,
          tipo: TipoMovimientoInsumo.SALIDA,
          cantidad: 1,
          cantidadAnterior: 100 - i,
          cantidadActual: 99 - i,
          motivo: `Uso ${i}`,
          usuarioId: usuarios.gerente,
          creadoEn: new Date(base + i * 60_000),
        })),
      });

      const primera = await historial(id).expect(200);

      expect(primera.body).toMatchObject({ pagina: 1, totalPaginas: 2, total: 12 });
      expect(primera.body.datos).toHaveLength(10);
      expect(primera.body.datos[0]).toEqual({
        id: expect.any(Number),
        fecha: '2026-11-17',
        hora: '09:11',
        usuario: 'Ana gerente',
        tipo: 'SALIDA',
        cantidad: 1,
        motivo: 'Uso 11',
      });
      const segunda = await historial(id, 2).expect(200);
      const motivos = [...primera.body.datos, ...segunda.body.datos].map(
        (m: { motivo: string }) => m.motivo,
      );
      expect(motivos).toEqual(Array.from({ length: 12 }, (_, i) => `Uso ${11 - i}`));
    });

    it('incluye los movimientos registrados por la API', async () => {
      const { id } = await crearInsumo(sucursales.a, { cantidad: 1 });
      await mover(id, { tipo: 'ENTRADA', cantidad: 4, motivo: 'Compra' }).expect(201);
      await mover(id, { tipo: 'SALIDA', cantidad: 2, motivo: 'Uso' }, tokens.gerente2).expect(201);

      const res = await historial(id).expect(200);

      expect(res.body.datos.map((m: { motivo: string; usuario: string }) => [m.motivo, m.usuario])).toEqual([
        ['Uso', 'Ana gerente2'],
        ['Compra', 'Ana gerente'],
      ]);
    });

    it('un insumo de otra sucursal responde 403 e inexistente 404', async () => {
      const { id } = await crearInsumo(sucursales.b);

      await historial(id).expect(403);
      await historial(2_000_000_000).expect(404);
    });

    it('una página inválida responde 400', async () => {
      const { id } = await crearInsumo(sucursales.a);

      await historial(id, 0).expect(400);
    });

    it('un rol distinto a GERENTE recibe 403 y sin token 401', async () => {
      const { id } = await crearInsumo(sucursales.a);

      await historial(id, undefined, tokens.mesero).expect(403);
      await api().get(`/api/v1/inventario/insumos/${id}/movimientos`).expect(401);
    });
  });
});
