import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ApiValidationPipe } from '@Common/pipes';
import { PrismaService } from '@Prisma/services';
import type { AlertaInsumoResponseDto } from '@Inventario/dto';
import { AlertasInsumoRepository } from '@Inventario/repositories';
import { EstadoAlerta, ModuloOrigen, Prisma, Rol, UnidadInsumo } from '@PrismaClient';

describe('Alertas de inventario (e2e)', () => {
  const sufijo = `e2e-h15-${Date.now()}`;
  const PASSWORD = 'E2ePass1234';

  let app: INestApplication;
  let prisma: PrismaService;
  let contador = 0;
  const sucursales = { a: 0, b: 0 };
  const usuarios: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());

  async function crearInsumo(sucursalId: number, cantidad: number, minimo: number) {
    return prisma.insumo.create({
      data: {
        sucursalId,
        nombre: `Insumo ${sufijo}-${++contador}`,
        unidad: UnidadInsumo.LB,
        cantidad,
        minimo,
      },
    });
  }

  const mover = (
    insumoId: number,
    tipo: 'ENTRADA' | 'SALIDA',
    cantidad: number,
    token = tokens.gerente,
  ) =>
    api()
      .post(`/api/v1/inventario/insumos/${insumoId}/movimientos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo, cantidad, motivo: 'Prueba' });

  const listar = (token = tokens.gerente) =>
    api().get('/api/v1/inventario/alertas').set('Authorization', `Bearer ${token}`);

  const marcarVista = (alertaId: number, token = tokens.gerente) =>
    api()
      .patch(`/api/v1/inventario/alertas/${alertaId}/vista`)
      .set('Authorization', `Bearer ${token}`);

  const alertasDe = (insumoId: number) =>
    prisma.alertaInsumo.findMany({ where: { insumoId }, orderBy: { id: 'asc' } });

  const listadas = async (insumoId: number, token = tokens.gerente) =>
    ((await listar(token).expect(200)).body as AlertaInsumoResponseDto[]).filter(
      (a) => a.insumoId === insumoId,
    );

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
      gerenteb: [Rol.GERENTE, b.id],
      mesero: [Rol.MESERO, a.id],
    };
    for (const [nombre, [rol, sucursalId]] of Object.entries(roles)) {
      const email = `${nombre}.${sufijo}@example.com`;
      const user = await prisma.user.create({ data: { email, passwordHash, rol, sucursalId } });
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

  it('flujo completo: movimiento → alerta → GET → PATCH vista → entrada → resuelta', async () => {
    const { id, nombre } = await crearInsumo(sucursales.a, 25, 20);

    await mover(id, 'SALIDA', 4).expect(201);
    expect(await alertasDe(id)).toHaveLength(0);

    await mover(id, 'SALIDA', 1).expect(201);
    const [creada, ...otras] = await alertasDe(id);
    expect(otras).toHaveLength(0);
    expect(creada).toMatchObject({ sucursalId: sucursales.a, estado: EstadoAlerta.ACTIVA });
    expect([creada.cantidad.toNumber(), creada.minimo.toNumber()]).toEqual([20, 20]);

    const avisos = await prisma.notificacion.findMany({
      where: { referenciaTipo: 'ALERTA_INSUMO', referenciaId: String(creada.id) },
    });
    expect(avisos.map((n) => n.destinatarioId).sort()).toEqual(
      [usuarios.gerente, usuarios.gerente2].sort(),
    );
    expect(avisos[0]).toMatchObject({
      moduloOrigen: ModuloOrigen.INVENTARIO,
      titulo: `Insumo por agotarse: ${nombre}`,
      mensaje: `${nombre} tiene 20 lb (mínimo 20 lb) en ${sufijo}-A.`,
    });

    await mover(id, 'SALIDA', 2.5).expect(201);
    expect(await alertasDe(id)).toHaveLength(1);

    expect(await listadas(id)).toEqual([
      {
        id: creada.id,
        insumoId: id,
        insumo: nombre,
        cantidad: 20,
        minimo: 20,
        unidad: 'lb',
        estado: 'ACTIVA',
        creadaEn: creada.creadaEn.toISOString(),
      },
    ]);

    const vista = await marcarVista(creada.id).expect(200);
    expect(vista.body).toMatchObject({ id: creada.id, estado: 'VISTA' });
    const guardada = await prisma.alertaInsumo.findUniqueOrThrow({ where: { id: creada.id } });
    expect(guardada.vistaEn).toBeInstanceOf(Date);

    await marcarVista(creada.id).expect(200);
    const otraVez = await prisma.alertaInsumo.findUniqueOrThrow({ where: { id: creada.id } });
    expect(otraVez.vistaEn).toEqual(guardada.vistaEn);
    expect((await listadas(id)).map((a) => a.estado)).toEqual(['VISTA']);

    await mover(id, 'ENTRADA', 2.5).expect(201);
    expect((await alertasDe(id))[0].estado).toBe(EstadoAlerta.VISTA);

    await mover(id, 'ENTRADA', 0.001).expect(201);
    const resuelta = await prisma.alertaInsumo.findUniqueOrThrow({ where: { id: creada.id } });
    expect(resuelta.estado).toBe(EstadoAlerta.RESUELTA);
    expect(resuelta.resueltaEn).toBeInstanceOf(Date);
    expect(await listadas(id)).toEqual([]);
    await marcarVista(creada.id).expect(409);

    await mover(id, 'SALIDA', 1).expect(201);
    const despues = await alertasDe(id);
    expect(despues.map((a) => a.estado)).toEqual([EstadoAlerta.RESUELTA, EstadoAlerta.ACTIVA]);
  });

  it('una entrada que supera el mínimo resuelve una alerta ACTIVA', async () => {
    const { id } = await crearInsumo(sucursales.a, 6, 5);
    await mover(id, 'SALIDA', 2).expect(201);

    await mover(id, 'ENTRADA', 10).expect(201);

    expect((await alertasDe(id)).map((a) => a.estado)).toEqual([EstadoAlerta.RESUELTA]);
  });

  it('dos salidas simultáneas que bajan al mínimo crean una sola alerta', async () => {
    const { id } = await crearInsumo(sucursales.a, 10, 9);

    const respuestas = await Promise.all([
      mover(id, 'SALIDA', 1, tokens.gerente),
      mover(id, 'SALIDA', 1, tokens.gerente2),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
    const alertas = await alertasDe(id);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].estado).toBe(EstadoAlerta.ACTIVA);
    expect(
      await prisma.notificacion.count({
        where: { referenciaTipo: 'ALERTA_INSUMO', referenciaId: String(alertas[0].id) },
      }),
    ).toBe(2);
  });

  it('si ya hay una alerta abierta, el índice único descarta la nueva sin romper la transacción', async () => {
    const insumo = await crearInsumo(sucursales.a, 1, 5);
    const alertas = app.get(AlertasInsumoRepository);
    const datos = {
      insumoId: insumo.id,
      sucursalId: sucursales.a,
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      sucursal: `${sufijo}-A`,
      cantidad: new Prisma.Decimal(1),
      minimo: new Prisma.Decimal(5),
    };

    const resultado = await prisma.$transaction(async (tx) => {
      const primera = await alertas.crear(datos, tx);
      const segunda = await alertas.crear(datos, tx);
      const movimientos = await tx.movimientoInsumo.count({ where: { insumoId: insumo.id } });
      return { primera, segunda, movimientos };
    });

    expect(resultado).toEqual({ primera: expect.any(Number), segunda: null, movimientos: 0 });
    expect(await alertasDe(insumo.id)).toHaveLength(1);
  });

  it('solo lista las alertas de la sucursal del gerente', async () => {
    const propio = await crearInsumo(sucursales.a, 1, 5);
    const ajeno = await crearInsumo(sucursales.b, 1, 5);
    await mover(propio.id, 'SALIDA', 1).expect(201);
    await mover(ajeno.id, 'SALIDA', 1, tokens.gerenteb).expect(201);

    const ids = ((await listar().expect(200)).body as AlertaInsumoResponseDto[]).map(
      (a) => a.insumoId,
    );

    expect(ids).toContain(propio.id);
    expect(ids).not.toContain(ajeno.id);
  });

  it('las alertas se listan de la más reciente a la más antigua', async () => {
    const primero = await crearInsumo(sucursales.a, 1, 5);
    const segundo = await crearInsumo(sucursales.a, 1, 5);
    await mover(primero.id, 'SALIDA', 1).expect(201);
    await mover(segundo.id, 'SALIDA', 1).expect(201);

    const ids = ((await listar().expect(200)).body as AlertaInsumoResponseDto[])
      .map((a) => a.insumoId)
      .filter((insumoId) => [primero.id, segundo.id].includes(insumoId));

    expect(ids).toEqual([segundo.id, primero.id]);
  });

  it('PATCH vista: otra sucursal 403, inexistente 404, otro rol 403 y sin token 401', async () => {
    const ajeno = await crearInsumo(sucursales.b, 1, 5);
    await mover(ajeno.id, 'SALIDA', 1, tokens.gerenteb).expect(201);
    const [alerta] = await alertasDe(ajeno.id);

    await marcarVista(alerta.id).expect(403);
    expect((await alertasDe(ajeno.id))[0].estado).toBe(EstadoAlerta.ACTIVA);
    await marcarVista(2_000_000_000).expect(404);
    await marcarVista(alerta.id, tokens.mesero).expect(403);
    await api().patch(`/api/v1/inventario/alertas/${alerta.id}/vista`).expect(401);
  });

  it('GET: otro rol 403 y sin token 401', async () => {
    await listar(tokens.mesero).expect(403);
    await api().get('/api/v1/inventario/alertas').expect(401);
  });
});
