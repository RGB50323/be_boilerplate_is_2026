import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuQueryDto } from '../dto/menu-query.dto.js';
import { CategoriaMenuDto, MenuResponseDto } from '../dto/menu-response.dto.js';
import { MenuRepository } from '../repository/menu.repository.js';

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
    const categorias = new Map<number, CategoriaMenuDto>();

    for (const fila of filas) {
      const { platillo } = fila;
      if (texto && !normalizar(platillo.nombre).includes(texto)) continue;

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
      });
    }

    return {
      sucursalId,
      categorias: [...categorias.values()]
        .sort(porNombre)
        .map((c) => ({ ...c, platillos: c.platillos.sort(porNombre) })),
    };
  }
}