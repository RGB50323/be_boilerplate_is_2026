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

function imagen(nombre: string): string {
  return `https://placehold.co/400x400?text=${encodeURIComponent(nombre)}`;
}

const DIAS_DEMO = 45;
const DESFASE_MS = 6 * 60 * 60 * 1000; // El Salvador: UTC-06:00

function generadorDemo(semilla: number) {
  let estado = semilla;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Más pedidos al almuerzo y a la cena.
function pesoHora(hora: number): number {
  if (hora === 12 || hora === 13) return 3;
  if (hora === 19 || hora === 20) return 2.5;
  if (hora === 18 || hora === 14) return 1.5;
  return 1;
}

async function crearPedidosDemo(sucursalId: Map<string, number>) {
  const ahora = Date.now();

  for (const [nombre, sId] of sucursalId) {
    const existentes = await prisma.pedido.count({
      where: { sucursalId: sId, numero: { startsWith: 'DEMO-' } },
    });
    if (existentes > 0) {
      console.log(`Pedidos demo de ${nombre}: ya existen (${existentes}), se omiten.`);
      continue;
    }

    const menu = await prisma.platilloSucursal.findMany({
      where: { sucursalId: sId, platillo: { activo: true, categoria: { activa: true } } },
      select: { platilloId: true, precio: true },
      orderBy: { platilloId: 'asc' },
    });
    if (!menu.length) continue;

    const azar = generadorDemo(sId * 7919);
    let creados = 0;

    for (let d = DIAS_DEMO - 1; d >= 0; d--) {
      const diaLocal = new Date(ahora - DESFASE_MS - d * 24 * 60 * 60 * 1000);
      const fecha = diaLocal.toISOString().slice(0, 10);
      const horario = HORARIOS_SUCURSAL.find((h) => h.diaSemana === diaLocal.getUTCDay());
      if (!horario) continue;

      const apertura = Number(horario.apertura.slice(0, 2));
      const cierre = Number(horario.cierre.slice(0, 2));
      const horas = Array.from({ length: cierre - apertura }, (_, i) => apertura + i);
      const pesoTotal = horas.reduce((t, h) => t + pesoHora(h), 0);
      const finDeSemana = diaLocal.getUTCDay() === 5 || diaLocal.getUTCDay() === 6;
      const pedidosDelDia = 8 + Math.floor(azar() * 8) + (finDeSemana ? 6 : 0);

      for (let i = 0; i < pedidosDelDia; i++) {
        let x = azar() * pesoTotal;
        const hora = horas.find((h) => (x -= pesoHora(h)) < 0) ?? horas[0];
        const minuto = Math.floor(azar() * 60);
        const creadoEn = new Date(
          `${fecha}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-06:00`,
        );
        // Solo pedidos que ya ocurrieron (con margen para la confirmación del pago).
        if (creadoEn.getTime() > ahora - 60 * 60 * 1000) continue;

        const lineas = new Map<number, { platilloId: number; cantidad: number; precioUnitario: number }>();
        const cuantas = 1 + Math.floor(azar() * 4);
        for (let l = 0; l < cuantas; l++) {
          // Sesgo hacia los primeros platillos para que haya un ranking claro.
          const item = menu[Math.floor(azar() ** 1.6 * menu.length)];
          const previa = lineas.get(item.platilloId);
          const cantidad = 1 + Math.floor(azar() * 3);
          lineas.set(item.platilloId, {
            platilloId: item.platilloId,
            cantidad: (previa?.cantidad ?? 0) + cantidad,
            precioUnitario: Number(item.precio),
          });
        }
        const detalles = [...lineas.values()];
        const subtotal = r2(detalles.reduce((t, l) => t + l.cantidad * l.precioUnitario, 0));
        const descuentos = azar() < 0.15 ? r2(subtotal * 0.1) : 0;
        const neto = subtotal - descuentos;
        const impuestos = r2(neto * 0.13);
        const tipo = azar() < 0.7 ? 'MESA' : 'LLEVAR';
        const propina = tipo === 'MESA' ? r2(neto * 0.1) : 0;
        const total = r2(neto + impuestos + propina);

        const sorteo = azar();
        const estadoPago =
          sorteo < 0.86 ? 'CONFIRMADO' : sorteo < 0.92 ? 'PENDIENTE' : sorteo < 0.96 ? 'REEMBOLSADO' : 'RECHAZADO';
        const estadoPedido =
          estadoPago === 'CONFIRMADO' ? 'ENTREGADO' : estadoPago === 'REEMBOLSADO' ? 'CANCELADO' : 'PENDIENTE_PAGO';
        const confirmadoEn =
          estadoPago === 'CONFIRMADO' || estadoPago === 'REEMBOLSADO'
            ? new Date(creadoEn.getTime() + (5 + Math.floor(azar() * 35)) * 60 * 1000)
            : null;

        creados++;
        const clave = `${sId}-${creados}`;
        await prisma.pedido.create({
          data: {
            numero: `DEMO-${String(creados).padStart(5, '0')}`,
            tipo,
            estado: estadoPedido,
            sucursalId: sId,
            subtotal,
            descuentos,
            impuestos,
            propina,
            total,
            creadoEn,
            detalles: { create: detalles },
            pagos: {
              create: {
                idempotencyKey: `demo-${clave}`,
                transaccionId: estadoPago === 'PENDIENTE' ? null : `demo-tx-${clave}`,
                monto: total,
                estado: estadoPago,
                metodo: 'TARJETA',
                creadoEn,
                confirmadoEn,
                reembolsadoEn:
                  estadoPago === 'REEMBOLSADO' && confirmadoEn
                    ? new Date(confirmadoEn.getTime() + 30 * 60 * 1000)
                    : null,
              },
            },
          },
        });
      }
    }
    console.log(`Pedidos demo de ${nombre}: ${creados} creados.`);
  }
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

  await crearPedidosDemo(sucursalId);

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
