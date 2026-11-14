import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import { saltoDePagina } from '@Common/paginacion';

export interface DisponibilidadFiltro {
  sucursalId: number;
  personas: number;
  inicio: Date;
  fin: Date;
}

@Injectable()
export class ReservacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMesaConHorario(mesaId: number, diaSemana: number) {
    return this.prisma.mesa.findUnique({
      where: { id: mesaId },
      include: {
        sucursal: { include: { horarios: { where: { diaSemana } } } },
      },
    });
  }

  /** La exclusión de PostgreSQL decide atómicamente qué solicitud gana.
   * Prisma no expone ON CONFLICT para restricciones de exclusión: esta única
   * sentencia parametrizada evita depender del formato de errores del adapter.
   */
  crearConfirmada(datos: {
    mesaId: number;
    clienteId: string;
    nombre: string;
    telefono: string;
    correo: string;
    personas: number;
    inicio: Date;
    fin: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const insertadas = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
        INSERT INTO reservacion (mesa_id, cliente_id, nombre, telefono, correo, personas, inicio, fin, estado)
        VALUES (${datos.mesaId}, ${datos.clienteId}::uuid, ${datos.nombre}, ${datos.telefono},
          ${datos.correo}, ${datos.personas}, ${datos.inicio.toISOString().slice(0, 23)}::timestamp,
          ${datos.fin.toISOString().slice(0, 23)}::timestamp, 'CONFIRMADA')
        ON CONFLICT ON CONSTRAINT reservacion_sin_solape DO NOTHING
        RETURNING id
      `);
      if (!insertadas.length) return null;
      return tx.reservacion.findUniqueOrThrow({
        where: { id: insertadas[0].id },
        include: { mesa: { include: { sucursal: true } } },
      });
    });
  }

  listarPorCliente(clienteId: string, pagina: number, porPagina: number) {
    const where = { clienteId };
    return this.prisma.$transaction(
      [
        this.prisma.reservacion.findMany({
          where,
          orderBy: [{ inicio: 'desc' }, { id: 'desc' }],
          skip: saltoDePagina(pagina, porPagina),
          take: porPagina,
          include: { mesa: { include: { sucursal: true } } },
        }),
        this.prisma.reservacion.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
  }

  findSucursalesConHorarios() {
    return this.prisma.sucursal.findMany({
      select: {
        id: true,
        nombre: true,
        horarios: {
          select: { diaSemana: true, apertura: true, cierre: true },
          orderBy: { diaSemana: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  findSucursalConHorario(sucursalId: number, diaSemana: number) {
    return this.prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        id: true,
        horarios: {
          where: { diaSemana },
          select: { apertura: true, cierre: true },
        },
      },
    });
  }

  findMesasDisponibles({
    sucursalId,
    personas,
    inicio,
    fin,
  }: DisponibilidadFiltro) {
    return this.prisma.mesa.findMany({
      where: {
        sucursalId,
        activa: true,
        capacidad: { gte: personas },
        reservaciones: {
          none: {
            estado: 'CONFIRMADA',
            // Intervalos [inicio, fin): una reserva puede empezar cuando otra termina.
            inicio: { lt: fin },
            fin: { gt: inicio },
          },
        },
      },
      select: { id: true, numero: true, capacidad: true, zona: true },
      orderBy: { numero: 'asc' },
    });
  }
}
