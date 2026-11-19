import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoResena, MotivoOcultacion, type User } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResenaRepository } from '../repositories/index.js';
import {
  ModeracionResenasService,
  YA_OCULTA,
} from './moderacion-resenas.service.js';

const gerente = { id: 'g-1', sucursalId: 1 } as User;

const fila = (cambios = {}) => ({
  id: 501,
  estrellas: 2,
  comentario: 'Llegó frío',
  estado: EstadoResena.VISIBLE,
  // 2026-11-15 20:00 en El Salvador
  creadaEn: new Date('2026-11-16T02:00:00Z'),
  ocultaEn: null as Date | null,
  motivoOcultacion: null as MotivoOcultacion | null,
  platillo: { nombre: 'Pupusa revuelta' },
  cliente: { nombre: 'Ana', apellido: 'López' },
  ocultaPor: null as null | {
    nombre: string | null;
    apellido: string | null;
    email: string;
  },
  pedido: { sucursalId: 1 },
  ...cambios,
});

const oculta = fila({
  estado: EstadoResena.OCULTA,
  ocultaEn: new Date('2026-11-18T03:30:00Z'),
  motivoOcultacion: MotivoOcultacion.OFENSIVO,
  ocultaPor: { nombre: 'Carla', apellido: 'Gómez', email: 'g@x.com' },
});

describe('ModeracionResenasService', () => {
  const repo = {
    listarModeracion: vi.fn(),
    buscarModeracion: vi.fn(),
    ocultar: vi.fn(),
  };
  let service: ModeracionResenasService;

  beforeEach(() => {
    vi.resetAllMocks();
    repo.listarModeracion.mockResolvedValue([1, [fila()]]);
    repo.buscarModeracion.mockResolvedValue(fila());
    repo.ocultar.mockResolvedValue(true);
    service = new ModeracionResenasService(repo as unknown as ResenaRepository);
  });

  describe('listar', () => {
    it('lista las reseñas de la sucursal del gerente, 10 por página', async () => {
      const res = await service.listar(gerente, { pagina: 2 });
      expect(repo.listarModeracion).toHaveBeenCalledWith(1, undefined, 10, 10);
      expect(res).toMatchObject({ pagina: 2, total: 1 });
      expect(res.datos[0]).toEqual({
        id: 501,
        platillo: 'Pupusa revuelta',
        estrellas: 2,
        comentario: 'Llegó frío',
        fecha: '2026-11-15',
        cliente: 'Ana L.',
        estado: 'VISIBLE',
        ocultacion: null,
      });
    });

    it('filtra por Visibles u Ocultas', async () => {
      await service.listar(gerente, {
        pagina: 1,
        estado: EstadoResena.OCULTA,
      });
      expect(repo.listarModeracion).toHaveBeenCalledWith(
        1,
        EstadoResena.OCULTA,
        0,
        10,
      );
    });

    it('una oculta trae quién, fecha, hora local y motivo', async () => {
      repo.listarModeracion.mockResolvedValue([1, [oculta]]);
      const res = await service.listar(gerente, { pagina: 1 });
      expect(res.datos[0].ocultacion).toEqual({
        por: 'Carla Gómez',
        fecha: '2026-11-17',
        hora: '21:30',
        motivo: 'OFENSIVO',
      });
    });

    it('sin sucursal no tiene acceso', async () => {
      await expect(
        service.listar({ ...gerente, sucursalId: null }, { pagina: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('ocultar', () => {
    it('oculta con el motivo y devuelve el detalle', async () => {
      repo.buscarModeracion
        .mockResolvedValueOnce(fila())
        .mockResolvedValueOnce(oculta);

      const res = await service.ocultar(
        gerente,
        501,
        MotivoOcultacion.OFENSIVO,
      );

      expect(repo.ocultar).toHaveBeenCalledWith(
        501,
        'g-1',
        MotivoOcultacion.OFENSIVO,
      );
      expect(res.estado).toBe('OCULTA');
      expect(res.ocultacion?.motivo).toBe('OFENSIVO');
    });

    it('si ya estaba oculta responde "Esta reseña ya estaba oculta."', async () => {
      repo.ocultar.mockResolvedValue(false);
      await expect(
        service.ocultar(gerente, 501, MotivoOcultacion.SPAM),
      ).rejects.toThrow(new ConflictException(YA_OCULTA));
    });

    it('una reseña de otra sucursal no se puede ocultar', async () => {
      repo.buscarModeracion.mockResolvedValue(
        fila({ pedido: { sucursalId: 2 } }),
      );
      await expect(
        service.ocultar(gerente, 501, MotivoOcultacion.SPAM),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.ocultar).not.toHaveBeenCalled();
    });

    it('404 si no existe o el id está fuera de rango', async () => {
      repo.buscarModeracion.mockResolvedValue(null);
      await expect(
        service.ocultar(gerente, 999, MotivoOcultacion.SPAM),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.ocultar(gerente, 2_147_483_648, MotivoOcultacion.SPAM),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
