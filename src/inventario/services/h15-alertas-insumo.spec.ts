import { AlertasInsumoRepository } from '@Inventario/repositories';
import {
  EstadoAlerta,
  ModuloOrigen,
  Prisma,
  Rol,
  UnidadInsumo,
  type User,
} from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertasService } from './alertas.service.js';
import { EvaluadorAlertasInventario } from './evaluador-alertas-inventario.service.js';

// H15. Recibir una alerta cuando un insumo esté por agotarse (backend).
// El contador del menú se prueba en el frontend: test/h15-alertas-insumo.test.ts.

const D = (n: number) => new Prisma.Decimal(n);
const gerente = { id: 'g1', rol: Rol.GERENTE, sucursalId: 1 } as User;

const insumo = (cantidad: number) => ({
  insumoId: 4,
  sucursalId: 1,
  nombre: 'Queso',
  unidad: UnidadInsumo.LB,
  sucursal: 'Centro',
  cantidad: D(cantidad),
  minimo: D(5),
});

describe('H15. Recibir una alerta cuando un insumo esté por agotarse', () => {
  const repo = { findNoResuelta: vi.fn(), crear: vi.fn(), resolver: vi.fn() };
  const notificaciones = { notificar: vi.fn() };
  const tx = {} as Prisma.TransactionClient;
  let evaluador: EvaluadorAlertasInventario;

  beforeEach(() => {
    [...Object.values(repo), notificaciones.notificar].forEach((f) =>
      f.mockReset(),
    );
    repo.findNoResuelta.mockResolvedValue(null);
    repo.crear.mockResolvedValue(77);
    evaluador = new EvaluadorAlertasInventario(
      repo as never,
      notificaciones as never,
    );
  });

  it('AC1: si la cantidad queda en o bajo el mínimo crea la alerta con insumo, cantidad, mínimo y sucursal', async () => {
    const alerta = await evaluador.evaluar(tx, insumo(5));

    expect(repo.crear).toHaveBeenCalledWith(insumo(5), tx);
    expect(alerta).toMatchObject({
      alertaId: 77,
      nombre: 'Queso',
      sucursal: 'Centro',
    });
    expect(alerta?.cantidad.toNumber()).toBe(5);
    expect(alerta?.minimo.toNumber()).toBe(5);
  });

  it('AC2: la alerta nueva se avisa a los gerentes de la sucursal en la campana y por correo', async () => {
    await evaluador.avisar({ ...insumo(3), alertaId: 77 });

    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        destinatario: { rol: Rol.GERENTE, sucursalId: 1 },
        titulo: 'Insumo por agotarse: Queso',
        mensaje: 'Queso tiene 3 lb (mínimo 5 lb) en Centro.',
        moduloOrigen: ModuloOrigen.INVENTARIO,
        enviarCorreo: true,
      }),
    );
  });

  it('AC3: si el insumo sigue bajo el mínimo no crea otra alerta', async () => {
    repo.findNoResuelta.mockResolvedValue({ id: 77 });

    await expect(evaluador.evaluar(tx, insumo(2))).resolves.toBeNull();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('AC4: si una entrada deja el insumo sobre el mínimo, la alerta se cierra sola', async () => {
    repo.findNoResuelta.mockResolvedValue({ id: 77 });

    await evaluador.evaluar(tx, insumo(12));

    expect(repo.resolver).toHaveBeenCalledWith(77, tx);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('AC5: al marcarla Vista deja de ser nueva pero sigue en la lista hasta resolverse', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 77,
      insumoId: 4,
      insumo: { nombre: 'Queso', unidad: UnidadInsumo.LB },
      cantidad: D(3),
      minimo: D(5),
      estado: EstadoAlerta.VISTA,
      creadaEn: new Date(),
    });
    const t = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ sucursalId: 1, estado: EstadoAlerta.ACTIVA }]),
      alertaInsumo: { update },
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const real = new AlertasInsumoRepository({
      $transaction: (cb: (x: typeof t) => unknown) => cb(t),
      alertaInsumo: { findMany },
    } as never);

    const vista = await new AlertasService(real).marcarVista(77, gerente);
    expect(update.mock.calls[0][0].data.estado).toBe(EstadoAlerta.VISTA);
    expect(vista.estado).toBe('VISTA');

    await new AlertasService(real).listar(gerente);
    expect(findMany.mock.calls[0][0].where.estado).toEqual({
      in: [EstadoAlerta.ACTIVA, EstadoAlerta.VISTA],
    });
  });

  it('AC6: el gerente solo consulta las alertas de su sucursal', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const real = new AlertasInsumoRepository({
      alertaInsumo: { findMany },
    } as never);

    await new AlertasService(real).listar({ ...gerente, sucursalId: 2 });

    expect(findMany.mock.calls[0][0].where.sucursalId).toBe(2);
  });
});
