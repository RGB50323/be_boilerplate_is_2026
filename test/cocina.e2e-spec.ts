import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import type { PedidoCocinaDto } from '@Cocina/dto';
import { EstadoItem, EstadoPedido, Rol, TipoPedido } from '@PrismaClient';

/**
 * Corre contra la base de DATABASE_URL (con las migraciones aplicadas). Crea
 * sus propias sucursales y usuarios con un sufijo único y los borra al final,
 * así no depende del seed ni choca con otros datos.
 */
describe('Cocina (e2e)', () => {
  const sufijo = `e2e-${Date.now()}`;
  const PASSWORD = 'E2ePass1234';

  let app: INestApplication;
  let prisma: PrismaService;
  const ids = { sucursales: [] as number[], usuarios: [] as string[], categoria: 0, platillo: 0 };
  const pedidos = { antiguo: 0, reciente: 0, llevarSinPagar: 0, todoListo: 0, otraSucursal: 0 };
  const tokens = { cocinaA: '', cliente: '' };

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const [sucursalA, sucursalB] = await Promise.all(
      ['A', 'B'].map((nombre) =>
        prisma.sucursal.create({ data: { nombre: `${sufijo}-${nombre}` } }),
      ),
    );
    ids.sucursales = [sucursalA.id, sucursalB.id];
    const mesa = await prisma.mesa.create({ data: { sucursalId: sucursalA.id, numero: 3 } });

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const crearUsuario = (nombre: string, rol: Rol, sucursalId: number | null) =>
      prisma.user.create({
        data: { email: `${nombre}.${sufijo}@example.com`, passwordHash, rol, sucursalId },
      });
    const usuarios = await Promise.all([
      crearUsuario('cocina-a', Rol.COCINA, sucursalA.id),
      crearUsuario('cliente', Rol.CLIENTE, null),
    ]);
    ids.usuarios = usuarios.map((u) => u.id);

    const categoria = await prisma.categoria.create({ data: { nombre: sufijo } });
    const platillo = await prisma.platillo.create({
      data: { nombre: `Platillo ${sufijo}`, categoriaId: categoria.id },
    });
    ids.categoria = categoria.id;
    ids.platillo = platillo.id;

    const crearPedido = async (
      sucursalId: number,
      tipo: TipoPedido,
      estado: EstadoPedido,
      minutosAtras: number,
      estadosItems: EstadoItem[],
    ) => {
      const pedido = await prisma.pedido.create({
        data: {
          sucursalId,
          tipo,
          estado,
          mesaId: tipo === TipoPedido.MESA && sucursalId === sucursalA.id ? mesa.id : null,
          creadoEn: new Date(Date.now() - minutosAtras * 60_000),
          detalles: {
            create: estadosItems.map((estadoItem) => ({
              platilloId: platillo.id,
              cantidad: 1,
              precioUnitario: 5,
              estado: estadoItem,
            })),
          },
        },
      });
      return pedido.id;
    };

    // Se crean en desorden a propósito, para que el orden lo ponga la query.
    pedidos.reciente = await crearPedido(sucursalA.id, TipoPedido.LLEVAR, EstadoPedido.ENVIADO_COCINA, 2, [EstadoItem.PENDIENTE]);
    pedidos.antiguo = await crearPedido(sucursalA.id, TipoPedido.MESA, EstadoPedido.EN_PREPARACION, 30, [EstadoItem.LISTO, EstadoItem.PENDIENTE]);
    pedidos.llevarSinPagar = await crearPedido(sucursalA.id, TipoPedido.LLEVAR, EstadoPedido.PENDIENTE_PAGO, 5, [EstadoItem.PENDIENTE]);
    pedidos.todoListo = await crearPedido(sucursalA.id, TipoPedido.MESA, EstadoPedido.EN_PREPARACION, 10, [EstadoItem.LISTO, EstadoItem.LISTO]);
    pedidos.otraSucursal = await crearPedido(sucursalB.id, TipoPedido.LLEVAR, EstadoPedido.ENVIADO_COCINA, 8, [EstadoItem.PENDIENTE]);

    tokens.cocinaA = await login(`cocina-a.${sufijo}@example.com`);
    tokens.cliente = await login(`cliente.${sufijo}@example.com`);
  });

  afterAll(async () => {
    if (prisma) {
      // detalle_pedido y refresh_tokens se borran en cascada.
      await prisma.pedido.deleteMany({ where: { sucursalId: { in: ids.sucursales } } });
      await prisma.platillo.deleteMany({ where: { id: ids.platillo } });
      await prisma.categoria.deleteMany({ where: { id: ids.categoria } });
      await prisma.user.deleteMany({ where: { id: { in: ids.usuarios } } });
      await prisma.mesa.deleteMany({ where: { sucursalId: { in: ids.sucursales } } });
      await prisma.sucursal.deleteMany({ where: { id: { in: ids.sucursales } } });
    }
    await app?.close();
  });

  it('un usuario COCINA ve solo los pendientes de su sucursal, del más antiguo al más reciente', async () => {
    const res = await request(app.getHttpServer())
      .get('/cocina/pedidos')
      .set('Authorization', `Bearer ${tokens.cocinaA}`)
      .expect(200);

    const body = res.body as PedidoCocinaDto[];
    expect(body.map((p) => p.id)).toEqual([pedidos.antiguo, pedidos.reciente]);
    expect(body.map((p) => p.id)).not.toContain(pedidos.otraSucursal);
    expect(body.map((p) => p.id)).not.toContain(pedidos.llevarSinPagar);
    expect(body.map((p) => p.id)).not.toContain(pedidos.todoListo);

    expect(body[0]).toMatchObject({ destino: 'Mesa 3', mesaNumero: 3, retrasado: true });
    expect(body[0].items).toHaveLength(2);
    expect(body[1]).toMatchObject({ destino: 'Para llevar', mesaNumero: null, retrasado: false });
  });

  it('un CLIENTE recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/cocina/pedidos')
      .set('Authorization', `Bearer ${tokens.cliente}`)
      .expect(403);
  });

  it('sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/cocina/pedidos').expect(401);
  });
});
