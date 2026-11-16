import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import type { PedidoCocinaDto } from '@Cocina/dto';
import { EstadoItem, EstadoPedido, Rol, TipoPedido } from '@PrismaClient';

describe('Marcar platillo listo (e2e)', () => {
  const sufijo = `e2e-h07-${Date.now()}`;
  const PASSWORD = 'E2ePass1234';

  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  let platilloId = 0;
  let categoriaId = 0;
  let siguienteMesa = 1;
  const sucursales = { a: 0, b: 0 };
  const usuarios: string[] = [];
  const tokens = { cocinaA: '', gerenteA: '', meseroA: '' };

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function crearPedido(
    sucursalId: number,
    cantidadItems: number,
    estado: EstadoPedido = EstadoPedido.ENVIADO_COCINA,
  ) {
    const mesa = await prisma.mesa.create({
      data: { sucursalId, numero: siguienteMesa++ },
    });
    const pedido = await prisma.pedido.create({
      data: {
        sucursalId,
        mesaId: mesa.id,
        tipo: TipoPedido.MESA,
        estado,
        detalles: {
          create: Array.from({ length: cantidadItems }, () => ({
            platilloId,
            cantidad: 1,
            precioUnitario: 5,
          })),
        },
      },
      include: { detalles: { orderBy: { id: 'asc' } } },
    });
    return { pedidoId: pedido.id, itemIds: pedido.detalles.map((d) => d.id) };
  }

  const marcar = (itemId: number, token = tokens.cocinaA) =>
    request(app.getHttpServer())
      .patch(`/cocina/items/${itemId}/listo`)
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
    const creados = await Promise.all(
      [
        ['cocina', Rol.COCINA],
        ['gerente', Rol.GERENTE],
        ['mesero', Rol.MESERO],
      ].map(([nombre, rol]) =>
        prisma.user.create({
          data: {
            email: `${nombre}.${sufijo}@example.com`,
            passwordHash,
            rol: rol as Rol,
            sucursalId: a.id,
          },
        }),
      ),
    );
    usuarios.push(...creados.map((u) => u.id));

    const categoria = await prisma.categoria.create({ data: { nombre: sufijo } });
    categoriaId = categoria.id;
    const platillo = await prisma.platillo.create({
      data: { nombre: `Platillo ${sufijo}`, categoriaId },
    });
    platilloId = platillo.id;

    tokens.cocinaA = await login(`cocina.${sufijo}@example.com`);
    tokens.gerenteA = await login(`gerente.${sufijo}@example.com`);
    tokens.meseroA = await login(`mesero.${sufijo}@example.com`);
  });

  afterAll(async () => {
    if (prisma) {
      const ids = [sucursales.a, sucursales.b];
      await prisma.pedido.deleteMany({ where: { sucursalId: { in: ids } } });
      await prisma.platillo.deleteMany({ where: { id: platilloId } });
      await prisma.categoria.deleteMany({ where: { id: categoriaId } });
      await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
      await prisma.mesa.deleteMany({ where: { sucursalId: { in: ids } } });
      await prisma.sucursal.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('marca un platillo: queda LISTO con su hora y el pedido sigue en cocina', async () => {
    const { pedidoId, itemIds } = await crearPedido(sucursales.a, 2);

    const res = await marcar(itemIds[0]).expect(200);

    expect(res.body).toEqual({
      itemId: itemIds[0],
      estado: 'LISTO',
      listoEn: expect.stringMatching(/^\d{2}:\d{2}$/),
      pedidoEstado: 'ENVIADO_COCINA',
    });
    const item = await prisma.detallePedido.findUniqueOrThrow({ where: { id: itemIds[0] } });
    expect(item.estado).toBe(EstadoItem.LISTO);
    expect(item.listoEn).toBeInstanceOf(Date);
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    expect(pedido.estado).toBe(EstadoPedido.ENVIADO_COCINA);
  });

  it('marcar el último platillo pasa el pedido a LISTO', async () => {
    const { pedidoId, itemIds } = await crearPedido(sucursales.a, 2);
    await marcar(itemIds[0]).expect(200);

    const res = await marcar(itemIds[1]).expect(200);

    expect(res.body.pedidoEstado).toBe('LISTO');
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    expect(pedido.estado).toBe(EstadoPedido.LISTO);
  });

  it('marcar dos veces el mismo platillo responde 409', async () => {
    const { itemIds } = await crearPedido(sucursales.a, 2);
    await marcar(itemIds[0]).expect(200);

    await marcar(itemIds[0]).expect(409);
  });

  it('dos marcados simultáneos del mismo platillo: uno 200 y otro 409', async () => {
    const { itemIds } = await crearPedido(sucursales.a, 2);

    const respuestas = await Promise.all([
      marcar(itemIds[0], tokens.cocinaA),
      marcar(itemIds[0], tokens.gerenteA),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('dos marcados simultáneos de los últimos platillos dejan el pedido en LISTO', async () => {
    const { pedidoId, itemIds } = await crearPedido(sucursales.a, 2);

    const respuestas = await Promise.all(itemIds.map((id) => marcar(id)));

    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    expect(pedido.estado).toBe(EstadoPedido.LISTO);
  });

  it('un platillo de otra sucursal responde 403 y no se modifica', async () => {
    const { itemIds } = await crearPedido(sucursales.b, 1);

    await marcar(itemIds[0]).expect(403);

    const item = await prisma.detallePedido.findUniqueOrThrow({ where: { id: itemIds[0] } });
    expect(item.estado).toBe(EstadoItem.PENDIENTE);
  });

  it('un platillo inexistente responde 404', async () => {
    await marcar(2_000_000_000).expect(404);
  });

  it('un platillo de un pedido cancelado responde 409', async () => {
    const { itemIds } = await crearPedido(sucursales.a, 1, EstadoPedido.CANCELADO);

    await marcar(itemIds[0]).expect(409);
  });

  it('un MESERO recibe 403 y sin token responde 401', async () => {
    const { itemIds } = await crearPedido(sucursales.a, 1);

    await marcar(itemIds[0], tokens.meseroA).expect(403);
    await request(app.getHttpServer()).patch(`/cocina/items/${itemIds[0]}/listo`).expect(401);
  });

  it('publica item:listo y, al completar el pedido, pedido:listo por Socket.IO', async () => {
    const { pedidoId, itemIds } = await crearPedido(sucursales.a, 1);
    const socket: Socket = io(url, {
      auth: { token: tokens.cocinaA },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const itemListo = new Promise<PedidoCocinaDto>((resolve) =>
        socket.once('item:listo', resolve),
      );
      const pedidoListo = new Promise<PedidoCocinaDto>((resolve) =>
        socket.once('pedido:listo', resolve),
      );

      await marcar(itemIds[0]).expect(200);

      const [item, pedido] = await Promise.all([itemListo, pedidoListo]);
      expect(item.id).toBe(pedidoId);
      expect(item.items[0]).toMatchObject({ id: itemIds[0], estado: 'LISTO' });
      expect(pedido.id).toBe(pedidoId);
    } finally {
      socket.disconnect();
    }
  });
});
