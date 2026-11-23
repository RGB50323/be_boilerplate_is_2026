import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import type { PedidoCocinaDto } from '@Cocina/dto';
import type { ItemPorEntregarDto } from '@Mesero/dto';
import { EstadoItem, EstadoPedido, Rol, TipoPedido } from '@PrismaClient';

describe('Entrega de platillos a la mesa (e2e)', () => {
  const sufijo = `e2e-h08-${Date.now()}`;
  const PASSWORD = 'E2ePass1234';

  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  let platilloId = 0;
  let categoriaId = 0;
  let siguienteMesa = 1;
  const sucursales = { a: 0, b: 0 };
  const usuarios: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function crearPedido(
    sucursalId: number,
    estadosItems: EstadoItem[],
    opciones: { tipo?: TipoPedido; estado?: EstadoPedido; listoHaceMin?: number } = {},
  ) {
    const tipo = opciones.tipo ?? TipoPedido.MESA;
    const mesa =
      tipo === TipoPedido.MESA
        ? await prisma.mesa.create({ data: { sucursalId, numero: siguienteMesa++ } })
        : null;
    const listoEn = new Date(Date.now() - (opciones.listoHaceMin ?? 1) * 60_000);
    const pedido = await prisma.pedido.create({
      data: {
        sucursalId,
        mesaId: mesa?.id ?? null,
        tipo,
        estado: opciones.estado ?? EstadoPedido.EN_PREPARACION,
        detalles: {
          create: estadosItems.map((estado) => ({
            platilloId,
            cantidad: 2,
            precioUnitario: 5,
            estado,
            listoEn: estado === EstadoItem.PENDIENTE ? null : listoEn,
          })),
        },
      },
      include: { detalles: { orderBy: { id: 'asc' } } },
    });
    return { pedidoId: pedido.id, mesa: mesa?.numero ?? null, itemIds: pedido.detalles.map((d) => d.id) };
  }

  const entregar = (itemId: number, token = tokens.mesero) =>
    request(app.getHttpServer())
      .patch(`/mesero/items/${itemId}/entregado`)
      .set('Authorization', `Bearer ${token}`);

  const listar = (token = tokens.mesero) =>
    request(app.getHttpServer())
      .get('/mesero/items-listos')
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}/cocina`;
    prisma = app.get(PrismaService);

    const [a, b] = await Promise.all(
      ['A', 'B'].map((n) => prisma.sucursal.create({ data: { nombre: `${sufijo}-${n}` } })),
    );
    sucursales.a = a.id;
    sucursales.b = b.id;

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const roles: Record<string, Rol> = {
      mesero: Rol.MESERO,
      mesero2: Rol.MESERO,
      cocina: Rol.COCINA,
    };
    for (const [nombre, rol] of Object.entries(roles)) {
      const user = await prisma.user.create({
        data: { email: `${nombre}.${sufijo}@example.com`, passwordHash, rol, sucursalId: a.id },
      });
      usuarios[nombre] = user.id;
      tokens[nombre] = await login(user.email);
    }

    const categoria = await prisma.categoria.create({ data: { nombre: sufijo } });
    categoriaId = categoria.id;
    const platillo = await prisma.platillo.create({
      data: { nombre: `Platillo ${sufijo}`, categoriaId },
    });
    platilloId = platillo.id;
  });

  afterAll(async () => {
    if (prisma) {
      const ids = [sucursales.a, sucursales.b];
      await prisma.pedido.deleteMany({ where: { sucursalId: { in: ids } } });
      await prisma.platilloSucursal.deleteMany({ where: { platilloId } });
      await prisma.platillo.deleteMany({ where: { id: platilloId } });
      await prisma.categoria.deleteMany({ where: { id: categoriaId } });
      await prisma.user.deleteMany({ where: { id: { in: Object.values(usuarios) } } });
      await prisma.mesa.deleteMany({ where: { sucursalId: { in: ids } } });
      await prisma.sucursal.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  describe('GET /mesero/items-listos', () => {
    it('lista solo ítems LISTO de pedidos de mesa de su sucursal, del más antiguo al más reciente', async () => {
      const reciente = await crearPedido(
        sucursales.a,
        [EstadoItem.LISTO, EstadoItem.PENDIENTE, EstadoItem.ENTREGADO],
        { listoHaceMin: 2 },
      );
      const antiguo = await crearPedido(sucursales.a, [EstadoItem.LISTO], { listoHaceMin: 10 });
      const llevar = await crearPedido(sucursales.a, [EstadoItem.LISTO], {
        tipo: TipoPedido.LLEVAR,
      });
      const otraSucursal = await crearPedido(sucursales.b, [EstadoItem.LISTO]);
      const cancelado = await crearPedido(sucursales.a, [EstadoItem.LISTO], {
        estado: EstadoPedido.CANCELADO,
      });
      const propios = [reciente, antiguo, llevar, otraSucursal, cancelado].map((p) => p.pedidoId);

      const res = await listar().expect(200);

      const items = (res.body as ItemPorEntregarDto[]).filter((i) => propios.includes(i.pedidoId));
      expect(items).toEqual([
        {
          itemId: antiguo.itemIds[0],
          pedidoId: antiguo.pedidoId,
          mesa: antiguo.mesa,
          platillo: `Platillo ${sufijo}`,
          cantidad: 2,
          listoEn: expect.stringMatching(/^\d{2}:\d{2}$/),
        },
        expect.objectContaining({ itemId: reciente.itemIds[0], mesa: reciente.mesa }),
      ]);
    });

    it('un ítem entregado ya no aparece en la lista', async () => {
      const { itemIds } = await crearPedido(sucursales.a, [EstadoItem.LISTO, EstadoItem.LISTO]);

      await entregar(itemIds[0]).expect(200);

      const ids = (await listar().expect(200)).body.map((i: ItemPorEntregarDto) => i.itemId);
      expect(ids).not.toContain(itemIds[0]);
      expect(ids).toContain(itemIds[1]);
    });

    it('un rol distinto a MESERO recibe 403 y sin token 401', async () => {
      await listar(tokens.cocina).expect(403);
      await request(app.getHttpServer()).get('/mesero/items-listos').expect(401);
    });
  });

  describe('GET /mesero/pedidos-pendientes-de-cobro', () => {
    const ruta = '/mesero/pedidos-pendientes-de-cobro';

    it('lista pedidos de mesa entregados de la sucursal y protege la consulta por rol', async () => {
      const local = await crearPedido(sucursales.a, [EstadoItem.ENTREGADO], {
        estado: EstadoPedido.ENTREGADO,
      });
      const externo = await crearPedido(sucursales.b, [EstadoItem.ENTREGADO], {
        estado: EstadoPedido.ENTREGADO,
      });
      const ids = new Set([local.pedidoId, externo.pedidoId]);

      const res = await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', `Bearer ${tokens.mesero2}`)
        .expect(200);
      const pedidos = res.body as { pedidoId: number }[];
      expect(pedidos.filter((p) => ids.has(p.pedidoId))).toEqual([
        {
          pedidoId: local.pedidoId, numero: null, mesa: local.mesa,
          puedeCobrar: true, pagoBloqueante: null, comprobanteId: null,
        },
      ]);
      await request(app.getHttpServer()).get(ruta).expect(401);
      await request(app.getHttpServer()).get(ruta)
        .set('Authorization', `Bearer ${tokens.cocina}`).expect(403);
    });
  });

  it('registra un pedido MESA y lo pasa de listo a pendiente de cobro por HTTP', async () => {
    const sucursalId = sucursales.a;
    const mesa = await prisma.mesa.create({ data: { sucursalId, numero: siguienteMesa++ } });
    await prisma.platilloSucursal.create({
      data: { sucursalId, platilloId, precio: 5, disponibilidad: 5 },
    });
    const alta = await request(app.getHttpServer()).post('/pedidos')
        .set('Authorization', `Bearer ${tokens.mesero}`)
        .send({ tipo: 'MESA', mesaId: mesa.id, items: [{ platilloId, cantidad: 2 }] })
        .expect(201);
      const pedidoId = (alta.body as { pedidoId: number }).pedidoId;
      const guardado = await prisma.pedido.findUniqueOrThrow({
        where: { id: pedidoId },
        include: { detalles: true },
      });
      expect(guardado).toMatchObject({
        sucursalId, mesaId: mesa.id, estado: EstadoPedido.ENVIADO_COCINA,
        detalles: [{ platilloId, cantidad: 2, estado: EstadoItem.PENDIENTE }],
      });
      const itemId = guardado.detalles[0].id;
      const comanda = {
        id: pedidoId, mesaNumero: mesa.numero,
        items: [expect.objectContaining({ id: itemId, estado: EstadoItem.PENDIENTE })],
      };
      const cocina = await request(app.getHttpServer()).get('/cocina/pedidos')
        .set('Authorization', `Bearer ${tokens.cocina}`).expect(200);
      expect(cocina.body).toContainEqual(expect.objectContaining(comanda));

      await request(app.getHttpServer()).patch(`/cocina/items/${itemId}/listo`)
        .set('Authorization', `Bearer ${tokens.cocina}`).expect(200);
      expect((await listar().expect(200)).body).toContainEqual(
        expect.objectContaining({ itemId, pedidoId, mesa: mesa.numero }),
      );
      await entregar(itemId).expect(200);
      const cobros = await request(app.getHttpServer()).get('/mesero/pedidos-pendientes-de-cobro')
        .set('Authorization', `Bearer ${tokens.mesero}`).expect(200);
      expect(cobros.body).toContainEqual(
        expect.objectContaining({ pedidoId, mesa: mesa.numero, puedeCobrar: true }),
      );
  });

  describe('PATCH /mesero/items/:itemId/entregado', () => {
    it('entrega un platillo y registra la hora y el mesero', async () => {
      const { pedidoId, itemIds } = await crearPedido(sucursales.a, [EstadoItem.LISTO, EstadoItem.LISTO]);

      const res = await entregar(itemIds[0]).expect(200);

      expect(res.body).toEqual({
        itemId: itemIds[0],
        estado: 'ENTREGADO',
        entregadoEn: expect.stringMatching(/^\d{2}:\d{2}$/),
        pedidoEstado: 'EN_PREPARACION',
      });
      const item = await prisma.detallePedido.findUniqueOrThrow({ where: { id: itemIds[0] } });
      expect(item.estado).toBe(EstadoItem.ENTREGADO);
      expect(item.entregadoEn).toBeInstanceOf(Date);
      expect(item.entregadoPorId).toBe(usuarios.mesero);
      const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
      expect(pedido.estado).toBe(EstadoPedido.EN_PREPARACION);
    });

    it('entregar el último platillo pasa el pedido a ENTREGADO', async () => {
      const { pedidoId, itemIds } = await crearPedido(sucursales.a, [EstadoItem.ENTREGADO, EstadoItem.LISTO], {
        estado: EstadoPedido.LISTO,
      });

      const res = await entregar(itemIds[1]).expect(200);

      expect(res.body.pedidoEstado).toBe('ENTREGADO');
      const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
      expect(pedido.estado).toBe(EstadoPedido.ENTREGADO);
    });

    it('entregar dos veces el mismo platillo responde 409', async () => {
      const { itemIds } = await crearPedido(sucursales.a, [EstadoItem.LISTO, EstadoItem.LISTO]);
      await entregar(itemIds[0]).expect(200);

      await entregar(itemIds[0]).expect(409);
    });

    it('dos entregas simultáneas del mismo platillo: una 200 y otra 409', async () => {
      const { itemIds } = await crearPedido(sucursales.a, [EstadoItem.LISTO, EstadoItem.LISTO]);

      const respuestas = await Promise.all([
        entregar(itemIds[0], tokens.mesero),
        entregar(itemIds[0], tokens.mesero2),
      ]);

      expect(respuestas.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      const item = await prisma.detallePedido.findUniqueOrThrow({ where: { id: itemIds[0] } });
      const ganador = respuestas[0].status === 200 ? usuarios.mesero : usuarios.mesero2;
      expect(item.entregadoPorId).toBe(ganador);
    });

    it('un platillo todavía PENDIENTE responde 422', async () => {
      const { itemIds } = await crearPedido(sucursales.a, [EstadoItem.PENDIENTE]);

      await entregar(itemIds[0]).expect(422);
    });

    it('un platillo de otra sucursal responde 403 y no se modifica', async () => {
      const { itemIds } = await crearPedido(sucursales.b, [EstadoItem.LISTO]);

      await entregar(itemIds[0]).expect(403);

      const item = await prisma.detallePedido.findUniqueOrThrow({ where: { id: itemIds[0] } });
      expect(item.estado).toBe(EstadoItem.LISTO);
    });

    it('un platillo inexistente responde 404', async () => {
      await entregar(2_000_000_000).expect(404);
    });

    it('un rol distinto a MESERO recibe 403 y sin token 401', async () => {
      const { itemIds } = await crearPedido(sucursales.a, [EstadoItem.LISTO]);

      await entregar(itemIds[0], tokens.cocina).expect(403);
      await request(app.getHttpServer()).patch(`/mesero/items/${itemIds[0]}/entregado`).expect(401);
    });

    it('al completar el pedido publica pedido:entregado por Socket.IO', async () => {
      const { pedidoId, itemIds } = await crearPedido(sucursales.a, [EstadoItem.LISTO], {
        estado: EstadoPedido.LISTO,
      });
      const socket: Socket = io(url, {
        auth: { token: tokens.cocina },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.once('connect', resolve);
          socket.once('connect_error', reject);
        });
        const recibido = new Promise<PedidoCocinaDto>((resolve) =>
          socket.once('pedido:entregado', resolve),
        );

        await entregar(itemIds[0]).expect(200);

        const pedido = await recibido;
        expect(pedido.id).toBe(pedidoId);
        expect(pedido.items[0]).toMatchObject({ id: itemIds[0], estado: 'ENTREGADO' });
      } finally {
        socket.disconnect();
      }
    });
  });
});
