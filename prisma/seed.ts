import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Rol } from '../src/generated/prisma/client.js';

// Crea usuarios con contraseña conocida (incluido un GERENTE_GENERAL), así que
// nunca debe correr contra producción.
if (process.env.NODE_ENV === 'production') {
  throw new Error('El seed no se puede ejecutar con NODE_ENV=production.');
}

const PASSWORD = 'Demo1234!';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SUCURSALES = [
  { nombre: 'Centro', direccion: 'Calle Rubén Darío #123, San Salvador' },
  { nombre: 'Escalón', direccion: 'Paseo General Escalón #4567, San Salvador' },
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
  rol: Rol;
  sucursal?: string;
};

const USUARIOS: UsuarioSeed[] = [
  { email: 'demo@example.com', nombre: 'Cliente', apellido: 'Demo', rol: Rol.CLIENTE },
  { email: 'mesero@example.com', nombre: 'Mario', apellido: 'Mesero', rol: Rol.MESERO, sucursal: 'Centro' },
  { email: 'cocina@example.com', nombre: 'Carla', apellido: 'Cocina', rol: Rol.COCINA, sucursal: 'Centro' },
  { email: 'gerente@example.com', nombre: 'Gabriel', apellido: 'Gerente', rol: Rol.GERENTE, sucursal: 'Centro' },
  { email: 'gerente.general@example.com', nombre: 'Gina', apellido: 'General', rol: Rol.GERENTE_GENERAL },
];

function imagen(nombre: string): string {
  return `https://placehold.co/400x400?text=${encodeURIComponent(nombre)}`;
}

async function main() {
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
    for (let numero = 1; numero <= 6; numero++) {
      await prisma.mesa.upsert({
        where: { sucursalId_numero: { sucursalId: id, numero } },
        update: {},
        create: { sucursalId: id, numero, capacidad: numero <= 4 ? 4 : 2, zona: numero <= 4 ? 'Salón' : 'Terraza' },
      });
    }
  }

  const categoriaId = new Map<string, number>();
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

  console.log('Seed listo.');
  console.log(`Sucursales: ${SUCURSALES.map((s) => s.nombre).join(', ')}`);
  console.log(`Usuarios (contraseña ${PASSWORD}):`);
  for (const u of USUARIOS) console.log(`  ${u.rol.padEnd(16)} ${u.email}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
