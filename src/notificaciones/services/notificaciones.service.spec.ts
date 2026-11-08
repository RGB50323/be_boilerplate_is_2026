import { NotFoundException } from '@nestjs/common';
import { EstadoCorreo, ModuloOrigen, Rol } from '@PrismaClient';
import { NotificacionRepository } from '@Notificaciones/repositories';
import { ValidacionAvisoError } from '@Notificaciones/errors';
import type { Aviso, EnviadorCorreo } from '@Notificaciones/types';
import { NotificacionesService } from './notificaciones.service.js';

const USUARIO_ID = '9f3dd0b4-843f-44e5-a94f-a574f89a4d33';
const OTRO_USUARIO_ID = '8319753b-9f42-4974-9c34-c4edc134a014';
const NOTIFICACION_ID = '34ddfbee-dde1-43ed-8066-f9d6a89e8462';

const avisoBase = (): Aviso => ({
  destinatario: { usuarioId: USUARIO_ID },
  titulo: 'Pedido listo',
  mensaje: 'Tu pedido ya está listo.',
  moduloOrigen: ModuloOrigen.PEDIDOS,
  referencia: { tipo: 'pedido', id: '123' },
});

function crearContexto() {
  const repository = {
    resolverUsuarioActivo: vi
      .fn()
      .mockResolvedValue([{ id: USUARIO_ID, email: 'cliente@example.com' }]),
    resolverGrupoActivo: vi.fn().mockResolvedValue([]),
    crearMuchas: vi.fn().mockResolvedValue(1),
    buscarCreadasParaCorreo: vi.fn().mockResolvedValue([]),
    registrarIntentoCorreo: vi.fn().mockResolvedValue(undefined),
    listarPorUsuario: vi.fn().mockResolvedValue([]),
    contarPorUsuario: vi.fn().mockResolvedValue(0),
    contarNoLeidasPorUsuario: vi.fn().mockResolvedValue(0),
    marcarLeida: vi.fn().mockResolvedValue(null),
  };
  const enviadorCorreo = { enviar: vi.fn().mockResolvedValue(undefined) };
  const esperarReintento = vi.fn().mockResolvedValue(undefined);
  const service = new NotificacionesService(
    repository as unknown as NotificacionRepository,
    enviadorCorreo as EnviadorCorreo,
    esperarReintento,
    0,
  );

  return { service, repository, enviadorCorreo, esperarReintento };
}

describe('NotificacionesService', () => {
  it('crea una notificación válida para un usuario activo', async () => {
    const { service, repository } = crearContexto();

    await expect(service.notificar(avisoBase())).resolves.toEqual({
      registradas: 1,
      omitidasPorDuplicado: 0,
    });
    expect(repository.resolverUsuarioActivo).toHaveBeenCalledWith(USUARIO_ID);
    expect(repository.crearMuchas).toHaveBeenCalledWith([
      expect.objectContaining({
        destinatarioId: USUARIO_ID,
        titulo: 'Pedido listo',
        estadoCorreo: null,
      }),
    ]);
  });

  it('resuelve un grupo por rol y sucursal y registra solo los usuarios activos devueltos', async () => {
    const { service, repository } = crearContexto();
    repository.resolverGrupoActivo.mockResolvedValue([
      { id: USUARIO_ID, email: 'uno@example.com' },
      { id: OTRO_USUARIO_ID, email: 'dos@example.com' },
    ]);
    repository.crearMuchas.mockResolvedValue(2);

    const resultado = await service.notificar({
      ...avisoBase(),
      destinatario: { rol: Rol.MESERO, sucursalId: 7 },
    });

    expect(repository.resolverGrupoActivo).toHaveBeenCalledWith(Rol.MESERO, 7);
    expect(repository.crearMuchas).toHaveBeenCalledWith([
      expect.objectContaining({ destinatarioId: USUARIO_ID }),
      expect.objectContaining({ destinatarioId: OTRO_USUARIO_ID }),
    ]);
    expect(resultado.registradas).toBe(2);
  });

  it('devuelve cero cuando el grupo no tiene usuarios activos', async () => {
    const { service, repository } = crearContexto();

    const resultado = await service.notificar({
      ...avisoBase(),
      destinatario: { rol: Rol.COCINA, sucursalId: 3 },
    });

    expect(resultado).toEqual({ registradas: 0, omitidasPorDuplicado: 0 });
    expect(repository.crearMuchas).not.toHaveBeenCalled();
  });

  it.each([
    {
      nombre: 'destinatario faltante',
      aviso: { ...avisoBase(), destinatario: undefined },
      mensaje: 'Falta el destinatario',
      campo: 'destinatario',
    },
    {
      nombre: 'título faltante',
      aviso: { ...avisoBase(), titulo: '   ' },
      mensaje: 'Falta el título',
      campo: 'titulo',
    },
  ])(
    'rechaza $nombre sin acceder al repositorio',
    async ({ aviso, mensaje, campo }) => {
      const { service, repository } = crearContexto();

      await service.notificar(aviso as Aviso).catch((error: unknown) => {
        expect(error).toBeInstanceOf(ValidacionAvisoError);
        expect((error as ValidacionAvisoError).message).toBe(mensaje);
        expect((error as ValidacionAvisoError).campo).toBe(campo);
      });
      expect(repository.resolverUsuarioActivo).not.toHaveBeenCalled();
      expect(repository.crearMuchas).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['título largo', { titulo: 'x'.repeat(101) }, 'titulo'],
    ['mensaje largo', { mensaje: 'x'.repeat(501) }, 'mensaje'],
    ['módulo inválido', { moduloOrigen: 'DESCONOCIDO' }, 'moduloOrigen'],
  ])('rechaza %s', async (_nombre, cambio, campo) => {
    const { service, repository } = crearContexto();

    await expect(
      service.notificar({ ...avisoBase(), ...cambio } as Aviso),
    ).rejects.toMatchObject({ campo });
    expect(repository.crearMuchas).not.toHaveBeenCalled();
  });

  it('informa las notificaciones omitidas por duplicado', async () => {
    const { service, repository } = crearContexto();
    repository.resolverGrupoActivo.mockResolvedValue([
      { id: USUARIO_ID, email: 'uno@example.com' },
      { id: OTRO_USUARIO_ID, email: 'dos@example.com' },
    ]);
    repository.crearMuchas.mockResolvedValue(1);

    await expect(
      service.notificar({
        ...avisoBase(),
        destinatario: { rol: Rol.MESERO, sucursalId: 1 },
      }),
    ).resolves.toEqual({ registradas: 1, omitidasPorDuplicado: 1 });
  });

  it('marca el correo como ENVIADO después del primer intento exitoso', async () => {
    const { service, repository, enviadorCorreo } = crearContexto();
    repository.buscarCreadasParaCorreo.mockResolvedValue([
      {
        id: NOTIFICACION_ID,
        email: 'cliente@example.com',
        titulo: 'Pedido listo',
        mensaje: 'Tu pedido ya está listo.',
      },
    ]);

    const resultado = await service.notificar({
      ...avisoBase(),
      enviarCorreo: true,
    });

    expect(resultado.registradas).toBe(1);
    await vi.waitFor(() => {
      expect(enviadorCorreo.enviar).toHaveBeenCalledTimes(1);
      expect(repository.registrarIntentoCorreo).toHaveBeenCalledWith(
        NOTIFICACION_ID,
        EstadoCorreo.ENVIADO,
      );
    });
  });

  it('conserva la notificación y marca FALLIDO tras tres intentos de correo', async () => {
    const { service, repository, enviadorCorreo, esperarReintento } =
      crearContexto();
    enviadorCorreo.enviar.mockRejectedValue(
      new Error('Proveedor no disponible'),
    );
    repository.buscarCreadasParaCorreo.mockResolvedValue([
      {
        id: NOTIFICACION_ID,
        email: 'cliente@example.com',
        titulo: 'Pedido listo',
        mensaje: 'Tu pedido ya está listo.',
      },
    ]);

    await expect(
      service.notificar({ ...avisoBase(), enviarCorreo: true }),
    ).resolves.toEqual({ registradas: 1, omitidasPorDuplicado: 0 });

    await vi.waitFor(() => {
      expect(enviadorCorreo.enviar).toHaveBeenCalledTimes(3);
      expect(repository.registrarIntentoCorreo).toHaveBeenNthCalledWith(
        3,
        NOTIFICACION_ID,
        EstadoCorreo.FALLIDO,
      );
    });
    expect(repository.crearMuchas).toHaveBeenCalledTimes(1);
    expect(esperarReintento).toHaveBeenCalledTimes(2);
  });

  it('pagina de 20 en 20 usando el id de la sesión', async () => {
    const { service, repository } = crearContexto();
    repository.listarPorUsuario.mockResolvedValue(
      Array.from({ length: 20 }, (_, indice) => ({ id: String(indice) })),
    );
    repository.contarPorUsuario.mockResolvedValue(45);
    repository.contarNoLeidasPorUsuario.mockResolvedValue(4);

    const resultado = await service.listar(USUARIO_ID, 2);

    expect(repository.listarPorUsuario).toHaveBeenCalledWith(USUARIO_ID, 2, 20);
    expect(repository.contarPorUsuario).toHaveBeenCalledWith(USUARIO_ID);
    expect(resultado).toMatchObject({ total: 45, pagina: 2, noLeidas: 4 });
    expect(resultado.datos).toHaveLength(20);
  });

  it('responde 404 al intentar marcar una notificación ajena', async () => {
    const { service, repository } = crearContexto();
    repository.marcarLeida.mockResolvedValue(null);

    await expect(
      service.marcarLeida(NOTIFICACION_ID, USUARIO_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.marcarLeida).toHaveBeenCalledWith(
      NOTIFICACION_ID,
      USUARIO_ID,
    );
  });

  it('devuelve sin cambios una notificación que ya estaba leída', async () => {
    const { service, repository } = crearContexto();
    const leidaEn = new Date('2026-11-07T15:00:00.000Z');
    repository.marcarLeida.mockResolvedValue({
      id: NOTIFICACION_ID,
      leida: true,
      leidaEn,
    });

    await expect(
      service.marcarLeida(NOTIFICACION_ID, USUARIO_ID),
    ).resolves.toEqual({
      id: NOTIFICACION_ID,
      leida: true,
      leidaEn,
    });
  });
});
