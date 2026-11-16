import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const PASSWORD = 'Demo1234!';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SUCURSALES = [
  { nombre: 'Centro', direccion: 'Calle Rubén Darío #123, San Salvador' },
  { nombre: 'Escalón', direccion: 'Paseo General Escalón #4567, San Salvador' },
];

// Horas locales de America/El_Salvador. Domingo = 0, lunes = 1, ..., sábado = 6.
const HORARIOS_SUCURSAL = [
  { diaSemana: 0, apertura: '08:00', cierre: '18:00' },
  { diaSemana: 1, apertura: '08:00', cierre: '21:00' },
  { diaSemana: 2, apertura: '08:00', cierre: '21:00' },
  { diaSemana: 3, apertura: '08:00', cierre: '21:00' },
  { diaSemana: 4, apertura: '08:00', cierre: '21:00' },
  { diaSemana: 5, apertura: '08:00', cierre: '23:00' },
  { diaSemana: 6, apertura: '08:00', cierre: '23:00' },
];

const CATEGORIAS = [
  { nombre: 'Entradas', activa: true },
  { nombre: 'Platillos principales', activa: true },
  { nombre: 'Bebidas', activa: true },
  { nombre: 'Postres', activa: true },
  { nombre: 'Temporada', activa: false },
];

type PlatilloSeed = {
  nombre: string;
  descripcion: string;
  categoria: string;
  activo?: boolean;
  centro: [number, number];
  escalon: [number, number];
};

const PLATILLOS: PlatilloSeed[] = [
  { nombre: 'Nachos con queso', descripcion: 'Tortilla crujiente con queso fundido', categoria: 'Entradas', centro: [6.5, 12], escalon: [6.75, 10] },
  { nombre: 'Yuca frita', descripcion: 'Yuca dorada con chicharrón y curtido', categoria: 'Entradas', centro: [5.25, 15], escalon: [5.5, 0] },
  { nombre: 'Alitas BBQ', descripcion: 'Seis alitas en salsa BBQ con aderezo ranch', categoria: 'Entradas', centro: [7.99, 8], escalon: [8.25, 8] },
  { nombre: 'Hamburguesa', descripcion: 'Carne de res con queso, tocino crujiente, aros de cebolla y salsa BBQ.', categoria: 'Platillos principales', centro: [8.99, 20], escalon: [9.25, 15] },
  { nombre: 'Pupusa revuelta', descripcion: 'Maíz con queso, frijol y chicharrón, con curtido y salsa', categoria: 'Platillos principales', centro: [1.25, 40], escalon: [1.5, 40] },
  { nombre: 'Pollo a la plancha', descripcion: 'Pechuga con arroz, ensalada y plátano frito', categoria: 'Platillos principales', centro: [9.5, 10], escalon: [9.75, 0] },
  { nombre: 'Costillas BBQ', descripcion: 'Media costilla en salsa BBQ con papas', categoria: 'Platillos principales', centro: [12.99, 6], escalon: [13.25, 6] },
  { nombre: 'Limonada con soda', descripcion: 'Limón natural con soda y hielo', categoria: 'Bebidas', centro: [2.25, 50], escalon: [2.25, 50] },
  { nombre: 'Horchata', descripcion: 'Horchata de morro con canela', categoria: 'Bebidas', centro: [2.5, 30], escalon: [2.75, 30] },
  { nombre: 'Flan de caramelo', descripcion: 'Flan casero con caramelo', categoria: 'Postres', centro: [3.5, 10], escalon: [3.75, 10] },
  { nombre: 'Pastel de chocolate', descripcion: 'Porción de pastel con crema', categoria: 'Postres', activo: false, centro: [4.25, 5], escalon: [4.25, 5] },
  { nombre: 'Sopa de temporada', descripcion: 'Sopa del día (categoría deshabilitada)', categoria: 'Temporada', centro: [5.0, 5], escalon: [5.0, 5] },
];

type UsuarioSeed = {
  email: string;
  nombre: string;
  apellido: string;
  rol: 'CLIENTE' | 'MESERO' | 'COCINA' | 'GERENTE' | 'GERENTE_GENERAL';
  sucursal?: string;
};

const USUARIOS: UsuarioSeed[] = [
  { email: 'demo@example.com', nombre: 'Cliente', apellido: 'Demo', rol: 'CLIENTE' },
  { email: 'mesero@example.com', nombre: 'Mario', apellido: 'Mesero', rol: 'MESERO', sucursal: 'Centro' },
  { email: 'cocina@example.com', nombre: 'Carla', apellido: 'Cocina', rol: 'COCINA', sucursal: 'Centro' },
  { email: 'gerente@example.com', nombre: 'Gabriel', apellido: 'Gerente', rol: 'GERENTE', sucursal: 'Centro' },
  { email: 'gerente.general@example.com', nombre: 'Gina', apellido: 'General', rol: 'GERENTE_GENERAL' },
];

type ItemSeed = {
  platillo: string;
  cantidad: number;
  nota?: string;
  estado?: 'PENDIENTE' | 'LISTO';
};

type PedidoSeed = {
  numero: string;
  sucursal: string;
  tipo: 'MESA' | 'LLEVAR';
  estado: 'PENDIENTE_PAGO' | 'RECIBIDO' | 'ENVIADO_COCINA' | 'EN_PREPARACION';
  mesa?: number;
  nombreCliente?: string;
  minutosAtras: number;
  items: ItemSeed[];
};

const PEDIDOS: PedidoSeed[] = [
  {
    numero: 'C-0001', sucursal: 'Centro', tipo: 'MESA', mesa: 3, estado: 'EN_PREPARACION', minutosAtras: 22,
    items: [
      { platillo: 'Hamburguesa', cantidad: 2, nota: 'Una sin cebolla' },
      { platillo: 'Limonada con soda', cantidad: 2, estado: 'LISTO' },
    ],
  },
  {
    numero: 'C-0002', sucursal: 'Centro', tipo: 'LLEVAR', nombreCliente: 'Cliente Demo', estado: 'RECIBIDO', minutosAtras: 9,
    items: [
      { platillo: 'Pupusa revuelta', cantidad: 4, nota: 'Extra curtido' },
      { platillo: 'Horchata', cantidad: 1 },
    ],
  },
  {
    numero: 'C-0003', sucursal: 'Centro', tipo: 'MESA', mesa: 1, estado: 'ENVIADO_COCINA', minutosAtras: 4,
    items: [
      { platillo: 'Alitas BBQ', cantidad: 1 },
      { platillo: 'Nachos con queso', cantidad: 1, nota: 'Sin jalapeño' },
    ],
  },
  {
    numero: 'C-0004', sucursal: 'Centro', tipo: 'LLEVAR', nombreCliente: 'Cliente Demo', estado: 'PENDIENTE_PAGO', minutosAtras: 2,
    items: [{ platillo: 'Costillas BBQ', cantidad: 1 }],
  },
  {
    numero: 'C-0005', sucursal: 'Centro', tipo: 'MESA', mesa: 5, estado: 'EN_PREPARACION', minutosAtras: 12,
    items: [
      { platillo: 'Yuca frita', cantidad: 1, estado: 'LISTO' },
      { platillo: 'Flan de caramelo', cantidad: 2, estado: 'LISTO' },
    ],
  },
  {
    numero: 'E-0001', sucursal: 'Escalón', tipo: 'MESA', mesa: 2, estado: 'EN_PREPARACION', minutosAtras: 18,
    items: [
      { platillo: 'Costillas BBQ', cantidad: 1, nota: 'Término medio' },
      { platillo: 'Horchata', cantidad: 2 },
    ],
  },
  {
    numero: 'E-0002', sucursal: 'Escalón', tipo: 'LLEVAR', nombreCliente: 'Cliente Demo', estado: 'RECIBIDO', minutosAtras: 6,
    items: [{ platillo: 'Hamburguesa', cantidad: 1 }],
  },
];

function imagen(nombre: string): string {
  return `https://placehold.co/400x400?text=${encodeURIComponent(nombre)}`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed no se ejecuta en producción.');
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const sucursalId = new Map<string, number>();
  for (const s of SUCURSALES) {
    const row = await prisma.sucursal.upsert({
      where: { nombre: s.nombre },
      update: { direccion: s.direccion },
      create: s,
    });
    sucursalId.set(s.nombre, row.id);
  }

  for (const id of sucursalId.values()) {
    for (const horario of HORARIOS_SUCURSAL) {
      // Prisma recibe Date para TIME: la fecha es auxiliar y Z evita depender
      // de la zona del equipo. Se guardan las horas locales, sin convertirlas a UTC.
      const horas = {
        apertura: new Date(`1970-01-01T${horario.apertura}:00.000Z`),
        cierre: new Date(`1970-01-01T${horario.cierre}:00.000Z`),
      };
      await prisma.horarioSucursal.upsert({
        where: { sucursalId_diaSemana: { sucursalId: id, diaSemana: horario.diaSemana } },
        update: horas,
        create: { sucursalId: id, diaSemana: horario.diaSemana, ...horas },
      });
    }

    for (let numero = 1; numero <= 6; numero++) {
      await prisma.mesa.upsert({
        where: { sucursalId_numero: { sucursalId: id, numero } },
        update: {},
        create: { sucursalId: id, numero, capacidad: numero <= 4 ? 4 : 2, zona: numero <= 4 ? 'Salón' : 'Terraza' },
      });
    }
  }

  const categoriaId = new Map<string, number>();
  const platilloId = new Map<string, number>();
  for (const c of CATEGORIAS) {
    const existente = await prisma.categoria.findFirst({
      where: { nombre: { equals: c.nombre, mode: 'insensitive' } },
    });
    const row = existente
      ? await prisma.categoria.update({
          where: { id: existente.id },
          data: { activa: c.activa, deshabilitadaEn: c.activa ? null : (existente.deshabilitadaEn ?? new Date()) },
        })
      : await prisma.categoria.create({
          data: { nombre: c.nombre, activa: c.activa, deshabilitadaEn: c.activa ? null : new Date() },
        });
    categoriaId.set(c.nombre, row.id);
  }

  for (const p of PLATILLOS) {
    const catId = categoriaId.get(p.categoria);
    if (catId === undefined) throw new Error(`Categoría inexistente: ${p.categoria}`);

    const existente = await prisma.platillo.findFirst({
      where: { nombre: { equals: p.nombre, mode: 'insensitive' } },
    });
    const data = {
      categoriaId: catId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenUrl: imagen(p.nombre),
      activo: p.activo ?? true,
    };
    const platillo = existente
      ? await prisma.platillo.update({ where: { id: existente.id }, data })
      : await prisma.platillo.create({ data });
    platilloId.set(p.nombre, platillo.id);

    const porSucursal: [string, [number, number]][] = [
      ['Centro', p.centro],
      ['Escalón', p.escalon],
    ];
    for (const [nombreSucursal, [precio, disponibilidad]] of porSucursal) {
      const sId = sucursalId.get(nombreSucursal);
      if (sId === undefined) throw new Error(`Sucursal inexistente: ${nombreSucursal}`);
      await prisma.platilloSucursal.upsert({
        where: { platilloId_sucursalId: { platilloId: platillo.id, sucursalId: sId } },
        update: { precio, disponibilidad },
        create: { platilloId: platillo.id, sucursalId: sId, precio, disponibilidad },
      });
    }
  }

  for (const u of USUARIOS) {
    const sId = u.sucursal ? sucursalId.get(u.sucursal) : undefined;
    await prisma.user.upsert({
      where: { email: u.email },
      update: { rol: u.rol, nombre: u.nombre, apellido: u.apellido, sucursalId: sId ?? null },
      create: {
        email: u.email,
        passwordHash,
        rol: u.rol,
        nombre: u.nombre,
        apellido: u.apellido,
        sucursalId: sId ?? null,
      },
    });
  }

  const cliente = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@example.com' } });

  for (const p of PEDIDOS) {
    const sId = sucursalId.get(p.sucursal);
    if (sId === undefined) throw new Error(`Sucursal inexistente: ${p.sucursal}`);

    const mesaId =
      p.mesa === undefined
        ? null
        : (await prisma.mesa.findUniqueOrThrow({ where: { sucursalId_numero: { sucursalId: sId, numero: p.mesa } } })).id;

    const items = p.items.map((item) => {
      const platillo = PLATILLOS.find((pl) => pl.nombre === item.platillo);
      const id = platilloId.get(item.platillo);
      if (!platillo || id === undefined) throw new Error(`Platillo inexistente: ${item.platillo}`);
      const [precio] = p.sucursal === 'Centro' ? platillo.centro : platillo.escalon;
      return { ...item, platilloId: id, precio };
    });
    const total = items.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
    const creadoEn = new Date(Date.now() - p.minutosAtras * 60_000);

    const datos = {
      tipo: p.tipo,
      estado: p.estado,
      mesaId,
      clienteId: p.tipo === 'LLEVAR' ? cliente.id : null,
      nombreCliente: p.nombreCliente ?? null,
      subtotal: total,
      total,
      creadoEn,
    };
    const pedido = await prisma.pedido.upsert({
      where: { sucursalId_numero: { sucursalId: sId, numero: p.numero } },
      update: datos,
      create: { ...datos, sucursalId: sId, numero: p.numero },
    });

    await prisma.detallePedido.deleteMany({ where: { pedidoId: pedido.id } });
    await prisma.detallePedido.createMany({
      data: items.map((item) => ({
        pedidoId: pedido.id,
        platilloId: item.platilloId,
        cantidad: item.cantidad,
        precioUnitario: item.precio,
        nota: item.nota ?? null,
        estado: item.estado ?? 'PENDIENTE',
        listoEn: item.estado === 'LISTO' ? new Date() : null,
      })),
    });

    if (p.tipo === 'LLEVAR') {
      const confirmado = p.estado !== 'PENDIENTE_PAGO';
      const pago = {
        monto: total,
        estado: confirmado ? ('CONFIRMADO' as const) : ('PENDIENTE' as const),
        metodo: 'TARJETA',
        confirmadoEn: confirmado ? creadoEn : null,
      };
      await prisma.pago.upsert({
        where: { idempotencyKey: `seed-${p.numero}` },
        update: pago,
        create: { ...pago, pedidoId: pedido.id, idempotencyKey: `seed-${p.numero}` },
      });
    }
  }

  console.log('Seed listo.');
  console.log(`Sucursales: ${SUCURSALES.map((s) => s.nombre).join(', ')}`);
  console.log(`Usuarios (contraseña ${PASSWORD}):`);
  for (const u of USUARIOS) console.log(`  ${u.rol.padEnd(16)} ${u.email}`);
  console.log(`Pedidos de ejemplo: ${PEDIDOS.map((p) => p.numero).join(', ')}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
