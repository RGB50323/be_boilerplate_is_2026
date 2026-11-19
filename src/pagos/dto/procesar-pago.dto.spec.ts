import 'reflect-metadata';
import { ApiValidationPipe } from '@Common/pipes';
import { describe, expect, it } from 'vitest';
import { ProcesarPagoDto } from './procesar-pago.dto.js';

const pipe = new ApiValidationPipe();
const item = {
  nombre: 'Limonada',
  cantidad: 1,
  precio_unitario: 17.5,
  subtotal: 17.5,
};
const ticket = { id: 88, total: 17.5, items: [item] };

function validar(cuerpo: unknown) {
  return pipe.transform(cuerpo, { type: 'body', metatype: ProcesarPagoDto });
}

describe('ProcesarPagoDto', () => {
  it.each([
    {},
    { metodo: 'EFECTIVO', montoRecibido: '20.00' },
    { metodo: 'TARJETA', marca: 'VISA', ultimosCuatro: '4242' },
  ])('acepta un ticket valido con %j', async (datos) => {
    await expect(
      validar({ solicitudId: 'solicitud-88', ticket, ...datos }),
    ).resolves.toMatchObject({ ticket });
  });

  it.each([
    { ticket: undefined },
    { ticket: null },
    { ticket: [] },
    { ticket: [ticket] },
    { ticket: '88' },
    { ticket: { ...ticket, items: null } },
    { ticket: { ...ticket, items: [] } },
    { ticket: { ...ticket, items: item } },
    { ticket: { ...ticket, items: [null] } },
    { ticket: { ...ticket, items: [[item]] } },
    { ticket: { ...ticket, items: ['item'] } },
    { ticket: { ...ticket, items: [{ ...item, cantidad: 0 }] } },
    { ticket: { ...ticket, items: [{ ...item, subtotal: null }] } },
    { metodo: null },
    { montoRecibido: null },
    { marca: null },
    { ultimosCuatro: null },
    { estado: 'CONFIRMADO' },
  ])('devuelve HTTP 400 para %j', async (datos) => {
    await expect(
      validar({ solicitudId: 'solicitud-88', ticket, ...datos }),
    ).rejects.toMatchObject({
      status: 400,
      response: { errores: expect.any(Object) },
    });
  });
});
