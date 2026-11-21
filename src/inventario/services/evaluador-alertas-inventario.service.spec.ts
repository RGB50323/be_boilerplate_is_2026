import { Logger } from '@nestjs/common';
import {
  AlertasInsumoRepository,
  type AlertaCreada,
  type InsumoTrasMovimiento,
} from '@Inventario/repositories';
import { EvaluadorAlertasInventario } from '@Inventario/services';
import type { NotificacionesService } from '@Notificaciones/services';
import type { PrismaService } from '@Prisma/services';
import {
  EstadoAlerta,
  ModuloOrigen,
  Prisma,
  Rol,
  UnidadInsumo,
} from '@PrismaClient';

const d = (valor: number | string) => new Prisma.Decimal(valor);

function insumo(cantidad: number, minimo = 20): InsumoTrasMovimiento {
  return {
    insumoId: 5,
    sucursalId: 1,
    nombre: 'Masa de maíz',
    unidad: UnidadInsumo.LB,
    sucursal: 'Centro',
    cantidad: d(cantidad),
    minimo: d(minimo),
  };
}

describe('EvaluadorAlertasInventario', () => {
  const findFirst = vi.fn();
  const queryRaw = vi.fn();
  const update = vi.fn();
  const notificar = vi.fn();
  const tx = {
    alertaInsumo: { findFirst, update },
    $queryRaw: queryRaw,
  } as unknown as Prisma.TransactionClient;
  let evaluador: EvaluadorAlertasInventario;

  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(null);
    queryRaw.mockResolvedValue([{ id: 9 }]);
    update.mockResolvedValue({});
    notificar.mockResolvedValue({ registradas: 1, omitidasPorDuplicado: 0 });
    evaluador = new EvaluadorAlertasInventario(
      new AlertasInsumoRepository({} as PrismaService),
      { notificar } as unknown as NotificacionesService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('evaluar', () => {
    it('llegar exactamente al mínimo crea una alerta ACTIVA con cantidad, mínimo y sucursal', async () => {
      const alerta = await evaluador.evaluar(tx, insumo(20));

      expect(alerta).toEqual({ ...insumo(20), alertaId: 9 });
      const sql = queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.sql).toMatch(/INSERT INTO alerta_insumo/);
      expect(sql.values).toEqual([5, 1, '20', '20']);
      expect(update).not.toHaveBeenCalled();
    });

    it('quedar debajo del mínimo crea una alerta', async () => {
      await expect(evaluador.evaluar(tx, insumo(18))).resolves.toMatchObject({ alertaId: 9 });
    });

    it('busca la alerta abierta del insumo entre ACTIVA y VISTA', async () => {
      await evaluador.evaluar(tx, insumo(18));

      expect(findFirst.mock.calls[0][0].where).toEqual({
        insumoId: 5,
        estado: { not: EstadoAlerta.RESUELTA },
      });
    });

    it('más salidas debajo del mínimo con una alerta abierta no crean otra', async () => {
      findFirst.mockResolvedValue({ id: 9 });

      await expect(evaluador.evaluar(tx, insumo(12))).resolves.toBeNull();
      expect(queryRaw).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('una entrada que queda igual al mínimo deja la alerta abierta', async () => {
      findFirst.mockResolvedValue({ id: 9 });

      await expect(evaluador.evaluar(tx, insumo(20))).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('una entrada que supera el mínimo resuelve la alerta abierta (ACTIVA o VISTA)', async () => {
      findFirst.mockResolvedValue({ id: 9 });

      await expect(evaluador.evaluar(tx, insumo(20.001))).resolves.toBeNull();
      const { where, data } = update.mock.calls[0][0];
      expect(where).toEqual({ id: 9 });
      expect(data.estado).toBe(EstadoAlerta.RESUELTA);
      expect(data.resueltaEn).toBeInstanceOf(Date);
    });

    it('por encima del mínimo y sin alerta abierta no hace nada', async () => {
      await expect(evaluador.evaluar(tx, insumo(30))).resolves.toBeNull();
      expect(queryRaw).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('si el índice único descarta la alerta (otra la creó a la vez) sigue sin error', async () => {
      queryRaw.mockResolvedValue([]);

      await expect(evaluador.evaluar(tx, insumo(18))).resolves.toBeNull();
      expect((queryRaw.mock.calls[0][0] as Prisma.Sql).sql).toMatch(
        /ON CONFLICT \(insumo_id\) WHERE estado <> 'RESUELTA' DO NOTHING/,
      );
    });
  });

  describe('avisar', () => {
    const alerta: AlertaCreada = { ...insumo(18.5), alertaId: 9 };

    it('avisa a los gerentes de la sucursal con correo', async () => {
      await evaluador.avisar(alerta);

      expect(notificar).toHaveBeenCalledWith({
        destinatario: { rol: Rol.GERENTE, sucursalId: 1 },
        titulo: 'Insumo por agotarse: Masa de maíz',
        mensaje: 'Masa de maíz tiene 18.5 lb (mínimo 20 lb) en Centro.',
        moduloOrigen: ModuloOrigen.INVENTARIO,
        referencia: { tipo: 'ALERTA_INSUMO', id: '9' },
        enviarCorreo: true,
      });
    });

    it('recorta el título a 100 caracteres', async () => {
      await evaluador.avisar({ ...alerta, nombre: 'x'.repeat(100) });

      expect(notificar.mock.calls[0][0].titulo).toHaveLength(100);
    });

    it('si el aviso falla solo lo registra en el log', async () => {
      notificar.mockRejectedValue(new Error('correo caído'));
      const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(evaluador.avisar(alerta)).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalled();
    });
  });
});
