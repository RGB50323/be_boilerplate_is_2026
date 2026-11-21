import { EstadoPedido, ModuloOrigen, TipoPedido } from '@PrismaClient';
import type { NotificacionesService } from '@Notificaciones/services';
import type { PedidoCocinaEvento } from '@Cocina/events';
import type { PedidosLlevarRepository } from '../repositories/pedidos-llevar.repository.js';
import { AvisoPedidoListoService } from './aviso-pedido-listo.service.js';

const CLIENTE = '9f3dd0b4-843f-44e5-a94f-a574f89a4d33';

const pedido = (cambios = {}) => ({
  id: 121,
  tipo: TipoPedido.LLEVAR,
  estado: EstadoPedido.LISTO,
  clienteId: CLIENTE as string | null,
  numero: 'S1-000121' as string | null,
  sucursal: { nombre: 'Centro' },
  ...cambios,
});

const evento = (id = 121) =>
  ({ sucursalId: 1, pedido: { id } }) as unknown as PedidoCocinaEvento;

function crearContexto(datos: unknown = pedido()) {
  const repository = { buscarParaAvisoListo: vi.fn().mockResolvedValue(datos) };
  const notificaciones = {
    notificar: vi
      .fn()
      .mockResolvedValue({ registradas: 1, omitidasPorDuplicado: 0 }),
  };
  const service = new AvisoPedidoListoService(
    repository as unknown as PedidosLlevarRepository,
    notificaciones as unknown as NotificacionesService,
  );
  return { service, repository, notificaciones };
}

describe('AvisoPedidoListoService', () => {
  it('avisa al cliente con el número de pedido y la sucursal, por plataforma y correo', async () => {
    const { service, repository, notificaciones } = crearContexto();

    await service.alListo(evento());

    expect(repository.buscarParaAvisoListo).toHaveBeenCalledWith(121);
    expect(notificaciones.notificar).toHaveBeenCalledWith({
      destinatario: { usuarioId: CLIENTE },
      titulo: 'Tu pedido está listo',
      mensaje:
        'Tu pedido S1-000121 ya está listo para recoger en la sucursal Centro.',
      moduloOrigen: ModuloOrigen.PEDIDOS,
      referencia: { tipo: 'PEDIDO_LISTO', id: '121' },
      enviarCorreo: true,
    });
  });

  it('conserva el aviso cuando cocina completa y cierra un pedido para llevar', async () => {
    const { service, notificaciones } = crearContexto(
      pedido({ estado: EstadoPedido.CERRADO }),
    );
    await expect(service.avisar(121)).resolves.toBe(true);
    expect(notificaciones.notificar).toHaveBeenCalledOnce();
  });

  it.each([
    ['es de mesa', { tipo: TipoPedido.MESA, clienteId: null }],
    ['fue cancelado', { estado: EstadoPedido.CANCELADO }],
    ['todavía tiene platillos pendientes', { estado: EstadoPedido.RECIBIDO }],
    ['no tiene cliente', { clienteId: null }],
  ])('no avisa si el pedido %s', async (_caso, cambios) => {
    const { service, notificaciones } = crearContexto(pedido(cambios));

    await expect(service.avisar(121)).resolves.toBe(false);
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('no avisa si el pedido no existe', async () => {
    const { service, notificaciones } = crearContexto(null);

    await expect(service.avisar(999)).resolves.toBe(false);
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('un evento repetido no crea un segundo aviso', async () => {
    const { service, notificaciones } = crearContexto();
    notificaciones.notificar
      .mockResolvedValueOnce({ registradas: 1, omitidasPorDuplicado: 0 })
      .mockResolvedValueOnce({ registradas: 0, omitidasPorDuplicado: 1 });

    await expect(service.avisar(121)).resolves.toBe(true);
    await expect(service.avisar(121)).resolves.toBe(false);
    // Misma referencia las dos veces: la clave única descarta la segunda
    const referencias = notificaciones.notificar.mock.calls.map(
      ([aviso]) => (aviso as { referencia: unknown }).referencia,
    );
    expect(referencias[0]).toEqual(referencias[1]);
  });

  it('usa el id si el pedido aún no tiene número', async () => {
    const { service, notificaciones } = crearContexto(pedido({ numero: null }));

    await service.avisar(121);

    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        mensaje:
          'Tu pedido #121 ya está listo para recoger en la sucursal Centro.',
      }),
    );
  });

  it('un fallo del aviso no se propaga a cocina', async () => {
    const { service, notificaciones } = crearContexto();
    notificaciones.notificar.mockRejectedValue(new Error('caído'));

    await expect(service.alListo(evento())).resolves.toBeUndefined();
  });
});
