import { readFileSync } from 'node:fs';
import { EstadoPedido, ModuloOrigen, TipoPedido } from '@PrismaClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisoPedidoListoService } from './aviso-pedido-listo.service.js';

// H25. Recibir aviso cuando mi pedido para llevar esté listo.

const pedido = (extra: Record<string, unknown> = {}) => ({
  id: 5,
  tipo: TipoPedido.LLEVAR,
  estado: EstadoPedido.LISTO,
  clienteId: 'c-1',
  numero: 'L1-000005',
  sucursal: { nombre: 'Centro' },
  ...extra,
});

describe('H25. Recibir aviso cuando mi pedido para llevar esté listo', () => {
  const repo = { buscarParaAvisoListo: vi.fn() };
  const notificaciones = { notificar: vi.fn() };
  let service: AvisoPedidoListoService;

  beforeEach(() => {
    repo.buscarParaAvisoListo.mockReset().mockResolvedValue(pedido());
    notificaciones.notificar
      .mockReset()
      .mockResolvedValue({ registradas: 1, omitidasPorDuplicado: 0 });
    service = new AvisoPedidoListoService(
      repo as never,
      notificaciones as never,
    );
  });

  it('AC1: con todos los platillos listos avisa en la plataforma y por correo con número y sucursal', async () => {
    await service.alListo({ sucursalId: 1, pedido: { id: 5 } } as never);

    expect(notificaciones.notificar).toHaveBeenCalledWith({
      destinatario: { usuarioId: 'c-1' },
      titulo: 'Tu pedido está listo',
      mensaje:
        'Tu pedido L1-000005 ya está listo para recoger en la sucursal Centro.',
      moduloOrigen: ModuloOrigen.PEDIDOS,
      referencia: { tipo: 'PEDIDO_LISTO', id: '5' },
      enviarCorreo: true,
    });
  });

  it('AC2: el aviso queda en el historial de notificaciones con su fecha y hora', () => {
    const esquema = readFileSync('prisma/schema.prisma', 'utf8');
    const modelo = esquema.slice(esquema.indexOf('model Notificacion {'));
    expect(modelo).toMatch(/creadaEn\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('AC3: con platillos pendientes o pedido cancelado no se envía el aviso', async () => {
    for (const estado of [
      EstadoPedido.EN_PREPARACION,
      EstadoPedido.CANCELADO,
    ]) {
      repo.buscarParaAvisoListo.mockResolvedValue(pedido({ estado }));
      await expect(service.avisar(5)).resolves.toBe(false);
    }
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('AC4: un pedido ya notificado no se vuelve a notificar', async () => {
    notificaciones.notificar.mockResolvedValue({
      registradas: 0,
      omitidasPorDuplicado: 1,
    });

    await expect(service.avisar(5)).resolves.toBe(false);
    const esquema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(esquema).toContain(
      '@@unique([moduloOrigen, referenciaTipo, referenciaId, destinatarioId])',
    );
  });

  it('AC5: solo lo recibe el cliente que hizo el pedido', async () => {
    await service.avisar(5);
    expect(notificaciones.notificar.mock.calls[0][0].destinatario).toEqual({
      usuarioId: 'c-1',
    });

    repo.buscarParaAvisoListo.mockResolvedValue(pedido({ clienteId: null }));
    await expect(service.avisar(5)).resolves.toBe(false);
  });
});
