import type { EventEmitter2 } from '@nestjs/event-emitter';
import { CocinaEvento } from '@Cocina/events';
import { CocinaEventsService, type CocinaService } from '@Cocina/services';
import type { PedidoCocina, PedidoCocinaRepository } from '@Cocina/repositories';

describe('CocinaEventsService', () => {
  const pedido = { id: 9, sucursalId: 2 } as PedidoCocina;
  const dto = { id: 9 };

  const findById = vi.fn();
  const esVisibleEnCocina = vi.fn();
  const emit = vi.fn();
  let service: CocinaEventsService;

  beforeEach(() => {
    vi.resetAllMocks();
    findById.mockResolvedValue(pedido);
    service = new CocinaEventsService(
      { findById } as unknown as PedidoCocinaRepository,
      { esVisibleEnCocina, toDto: () => dto } as unknown as CocinaService,
      { emit } as unknown as EventEmitter2,
    );
  });

  it('pedidoEnviadoACocina publica pedido:nuevo para la sucursal del pedido', async () => {
    esVisibleEnCocina.mockReturnValue(true);

    await service.pedidoEnviadoACocina(9);

    expect(emit).toHaveBeenCalledWith(CocinaEvento.PEDIDO_NUEVO, { sucursalId: 2, pedido: dto });
  });

  it('pedidoEnviadoACocina no publica nada si el pedido todavía no es visible', async () => {
    esVisibleEnCocina.mockReturnValue(false);

    await service.pedidoEnviadoACocina(9);

    expect(emit).not.toHaveBeenCalled();
  });

  it('pedidoActualizado publica pedido:actualizado si sigue en la cola', async () => {
    esVisibleEnCocina.mockReturnValue(true);

    await service.pedidoActualizado(9);

    expect(emit).toHaveBeenCalledWith(CocinaEvento.PEDIDO_ACTUALIZADO, { sucursalId: 2, pedido: dto });
  });

  it('pedidoActualizado publica pedido:retirado si ya no quedan ítems pendientes', async () => {
    esVisibleEnCocina.mockReturnValue(false);

    await service.pedidoActualizado(9);

    expect(emit).toHaveBeenCalledWith(CocinaEvento.PEDIDO_RETIRADO, { sucursalId: 2, pedidoId: 9 });
  });

  it('ignora un pedido inexistente', async () => {
    findById.mockResolvedValue(null);

    await service.pedidoActualizado(404);

    expect(emit).not.toHaveBeenCalled();
  });
});
