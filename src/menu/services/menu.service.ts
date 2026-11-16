import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuQueryDto } from '../dto/menu-query.dto.js';
import { CategoriaMenuDto, MenuResponseDto } from '../dto/menu-response.dto.js';
import { MenuRepository } from '../repository/menu.repository.js';
import { redondearPromedio } from '@Resenas/utils';

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
  a.nombre.localeCompare(b.nombre, 'es');

@Injectable()
export class MenuService {
  constructor(private readonly repository: MenuRepository) {}

  async obtenerMenu(
    sucursalId: number,
    query: MenuQueryDto,
  ): Promise<MenuResponseDto> {
    const { q, categoriaId, precioMin, precioMax } = query;

    if (
      precioMin !== undefined &&
      precioMax !== undefined &&
      precioMin > precioMax
    ) {
      throw new BadRequestException(
        'precioMin no puede ser mayor que precioMax',
      );
    }

    if (!(await this.repository.sucursalExiste(sucursalId))) {
      throw new NotFoundException('La sucursal no existe');
    }

    const filas = await this.repository.findVisibles(sucursalId, {
      categoriaId,
      precioMin,
      precioMax,
    });

    const texto = q ? normalizar(q.trim()) : '';
    const visibles = texto
      ? filas.filter((f) => normalizar(f.platillo.nombre).includes(texto))
      : filas;

    const resumenes = visibles.length
      ? await this.repository.resumenResenas(visibles.map((f) => f.platillo.id))
      : [];
    const resenas = new Map(resumenes.map((r) => [r.platilloId, r]));
    const categorias = new Map<number, CategoriaMenuDto>();

    for (const fila of visibles) {
      const { platillo } = fila;
      const resumen = resenas.get(platillo.id);

      let categoria = categorias.get(platillo.categoria.id);
      if (!categoria) {
        categoria = {
          id: platillo.categoria.id,
          nombre: platillo.categoria.nombre,
          platillos: [],
        };
        categorias.set(categoria.id, categoria);
      }

      categoria.platillos.push({
        id: platillo.id,
        nombre: platillo.nombre,
        descripcion: platillo.descripcion,
        precio: Number(fila.precio),
        imagenUrl: platillo.imagenUrl,
        disponibilidad: fila.disponibilidad,
        promedio: redondearPromedio(resumen?._avg.estrellas),
        totalResenas: resumen?._count._all ?? 0,
      });
    }

    return {
      sucursalId,
      categorias: [...categorias.values()]
        .sort(porNombre)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          platillos: c.platillos.sort(porNombre),
        })),
    };
  }
}
