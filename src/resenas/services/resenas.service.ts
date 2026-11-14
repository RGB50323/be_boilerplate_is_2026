import { Injectable, NotFoundException } from '@nestjs/common';
import { metaPaginacion, saltoDePagina } from '@Common/paginacion';
import { ResenasPlatilloResponseDto } from '../dto/index.js';
import { ResenaRepository } from '../repositories/index.js';
import { redondearPromedio } from '../utils/index.js';

export const RESENAS_POR_PAGINA = 10;

const fechaLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador',
});

// Nombre + inicial del apellido, nunca el apellido completo
export const nombrePublico = (
  nombre: string | null,
  apellido: string | null,
) => {
  const base = nombre?.trim() || 'Cliente';
  const inicial = apellido?.trim().charAt(0).toUpperCase();
  return inicial ? `${base} ${inicial}.` : base;
};

@Injectable()
export class ResenasService {
  constructor(private readonly repository: ResenaRepository) {}

  async listarPorPlatillo(
    platilloId: number,
    pagina: number,
  ): Promise<ResenasPlatilloResponseDto> {
    if (!(await this.repository.platilloActivo(platilloId))) {
      throw new NotFoundException('El platillo no existe o está deshabilitado');
    }

    const [resumen, grupos, filas] = await Promise.all([
      this.repository.resumen(platilloId),
      this.repository.distribucion(platilloId),
      this.repository.findPagina(
        platilloId,
        saltoDePagina(pagina, RESENAS_POR_PAGINA),
        RESENAS_POR_PAGINA,
      ),
    ]);
    const total = resumen._count._all;
    const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of grupos) {
      distribucion[g.estrellas as keyof typeof distribucion] = g._count._all;
    }

    return {
      ...metaPaginacion(total, pagina, RESENAS_POR_PAGINA),
      promedio: redondearPromedio(resumen._avg.estrellas),
      distribucion,
      resenas: filas.map((r) => ({
        id: r.id,
        estrellas: r.estrellas,
        comentario: r.comentario,
        fecha: fechaLocal.format(r.creadaEn),
        cliente: nombrePublico(r.cliente.nombre, r.cliente.apellido),
      })),
    };
  }
}
