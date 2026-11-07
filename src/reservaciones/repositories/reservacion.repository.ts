import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

export interface DisponibilidadFiltro {
  sucursalId: number;
  personas: number;
  inicio: Date;
  fin: Date;
}

@Injectable()
export class ReservacionRepository {
  constructor(private readonly prisma: PrismaService) {}

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
