# H16 — Cobro de pedidos y comprobantes

Todas las rutas requieren `Authorization: Bearer <token>`. Los ejemplos usan datos ficticios y un pedido de 17.50.

## Iniciar el cobro

`POST /api/v1/pagos/procesar` devuelve HTTP 201. El pedido y las líneas deben coincidir con el detalle actual que devuelve H04 o el seguimiento de H05. El servidor valida el total, el nombre, la cantidad, el precio unitario y el subtotal de cada línea.

### Efectivo para MESA

Solo se acepta para pedidos `ENTREGADO`. Puede cobrar un mesero o gerente de la misma sucursal, o un gerente general. Enviar la solicitud confirma el efectivo y no pasa por el simulador.

```json
{
  "solicitudId": "caja-87-1",
  "metodo": "EFECTIVO",
  "montoRecibido": "20.00",
  "ticket": {
    "id": 87,
    "total": 17.5,
    "items": [
      {
        "nombre": "Limonada",
        "precio_unitario": 17.5,
        "cantidad": 1,
        "subtotal": 17.5
      }
    ]
  }
}
```

```json
{
  "pagoId": 31,
  "ticketId": 87,
  "transaccionId": "449297a6-c14b-4af2-8dac-fd6638903a12",
  "estado": "CONFIRMADO",
  "comprobanteId": 24
}
```

El cambio de 2.50 queda en `detallePago` del pago y del comprobante. El estado `CERRADO`, el pago confirmado y el comprobante se guardan juntos.

### Tarjeta simulada

Para MESA se aplican los permisos y el estado indicados arriba. Para LLEVAR, el cliente propietario paga en `PENDIENTE_PAGO`. Enviar únicamente una marca ficticia y cuatro dígitos ficticios. La API rechaza campos ajenos al DTO, como número completo y CVV.

```json
{
  "solicitudId": "cliente-88-1",
  "metodo": "TARJETA",
  "marca": "VISA",
  "ultimosCuatro": "4242",
  "ticket": {
    "id": 88,
    "total": 17.5,
    "items": [
      {
        "nombre": "Limonada",
        "precio_unitario": 17.5,
        "cantidad": 1,
        "subtotal": 17.5
      }
    ]
  }
}
```

```json
{
  "pagoId": 32,
  "ticketId": 88,
  "transaccionId": "b1baaab9-fbcf-4f16-b46a-42c8d64d7702",
  "estado": "PENDIENTE",
  "comprobanteId": null
}
```

Un cuerpo anterior con solo `solicitudId` y `ticket` sigue usando la tarjeta simulada y guarda `detallePago: null`. Un intento rechazado admite otro cobro con un **nuevo** `solicitudId`. Repetir la misma solicitud recupera el intento original. Cambiar pedido, importe, método, datos de cobro o líneas de un ticket con snapshot bajo el mismo identificador devuelve 409.

## Resolución automática de tarjetas

El POST devuelve `PENDIENTE` inmediatamente. Cada tarjeta vence entre 5000 y 10000 ms después de `Pago.creadoEn`. El UUID aleatorio que el simulador genera al iniciar el pago fija ese retraso mediante una función determinista. El trabajador reconstruye el mismo vencimiento a partir de `transaccionId` y `creadoEn`, que ya se conservan en PostgreSQL.

El trabajador consulta PostgreSQL al arrancar y cada 500 ms. Resuelve las tarjetas vencidas aunque se cierre el navegador y retoma los pendientes al reiniciarse. La resolución ocurre en una consulta posterior al vencimiento. Una transición condicional permite que solo una instancia confirme y emita el comprobante.

Por defecto, el resultado automático es `CONFIRMADO`. Con `NODE_ENV=test`, `H16_SIMULADOR_RETRASO_MS` permite fijar la demora y `H16_SIMULADOR_RESULTADO` admite `CONFIRMADO`, `RECHAZADO` o `PENDIENTE`. Fuera de ese entorno se ignoran ambas variables. El cliente y el mesero consultan el resultado por las rutas existentes. El PATCH sigue reservado a gerencia para pruebas y operaciones controladas.

Si la confirmación de LLEVAR qued? guardada pero falló su paso a `RECIBIDO`, el trabajador reintenta H05 sin volver a cobrar ni emitir otro comprobante. Los pendientes históricos sin método TARJETA explícito o sin snapshot quedan fuera de la resolución automática.

## Consultar y confirmar

- `GET /api/v1/pagos/pedido/:pedidoId` devuelve HTTP 200. Un pedido autorizado sin pagos devuelve `{"pago":null}`. Cuando hay pago, devuelve `pagoId`, `pedidoId`, `transaccionId`, `estado`, `metodo` y `comprobanteId`. Los identificadores de transacción, método y comprobante pueden ser nulos. Un pedido inexistente devuelve 404 y uno fuera del alcance del usuario devuelve 403.
- Para recuperar un cobro tras un 409, la consulta prioriza el pago más reciente en `PENDIENTE`, `CONFIRMADO` o `REEMBOLSADO`. Si no existe un pago bloqueante, devuelve el último `RECHAZADO`. En un empate de fecha, prevalece el ID más alto. El mesero consulta pedidos MESA de su sucursal, el gerente consulta su sucursal, el gerente general tiene acceso global y el cliente consulta sus propios pedidos LLEVAR.

- `GET /api/v1/pagos/transaccion/:transaccionId` devuelve 200, el estado registrado y `comprobanteId`. Pueden usarlo gerencia y, para pedidos MESA, un mesero de la misma sucursal.
- `PATCH /api/v1/pagos/transaccion/:transaccionId/estado` devuelve 200. Solo gerencia puede actualizar la transacción de tarjeta simulada. Ejemplo de confirmación: `{"estado":"CONFIRMADO"}`. El simulador permite `PENDIENTE → CONFIRMADO`, `PENDIENTE → RECHAZADO` y `CONFIRMADO → REEMBOLSADO`.
- `GET /api/v1/pedidos/:id/seguimiento` devuelve al cliente propietario el pedido LLEVAR y los campos `pago` y `comprobanteId` del último intento. Tras una confirmación, H05 pasa el pedido a `RECIBIDO`. H16 deja el cierre final de LLEVAR a la futura integración de entrega.

Ejemplo de respuesta de consulta o actualización de la transacción:

```json
{
  "id": 32,
  "pedidoId": 88,
  "transaccionId": "b1baaab9-fbcf-4f16-b46a-42c8d64d7702",
  "monto": "17.5",
  "estado": "CONFIRMADO",
  "creadoEn": "2026-11-18T19:00:00.000Z",
  "actualizadoEn": "2026-11-18T19:00:09.000Z",
  "confirmadoEn": "2026-11-18T19:00:09.000Z",
  "reembolsadoEn": null,
  "comprobanteId": 25
}
```

Si falló la transición a `RECIBIDO` después de guardar el pago confirmado, repetir el POST con el mismo cuerpo y `solicitudId` reintenta H05. También se puede repetir la confirmación con el PATCH de gerencia. Ambas opciones conservan el cobro y comprobante ya emitidos.

## Descargar el comprobante

- `GET /api/v1/comprobantes/:id` devuelve metadatos y snapshots históricos, incluido `detallePago` cuando existe.
- `GET /api/v1/comprobantes/:id/pdf` devuelve `application/pdf` como adjunto. El primer PDF generado queda registrado como ORIGINAL y los siguientes como COPIA. La confirmación emite el registro del comprobante. La generación del PDF ocurre al descargar.
- Pueden descargarlo el cliente propietario, un mesero de la misma sucursal para MESA, un gerente de la sucursal o el gerente general. El ID de la URL es `comprobanteId`.
- Un comprobante histórico con `detallePago: null` se puede descargar si tiene un snapshot de ticket compatible. Los comprobantes que carecen de ese snapshot solo exponen metadatos. Los pagos pendientes anteriores sin `ticketSnapshot` no se pueden confirmar con emisión histórica.

## Errores

| HTTP | Ejemplo                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400  | Efectivo insuficiente, datos de método inválidos o ticket distinto del pedido.                                                                   |
| 401  | Sesión ausente o inválida.                                                                                                                       |
| 403  | Pedido ajeno, mesero de otra sucursal o rol sin permiso para el PATCH.                                                                           |
| 404  | Pedido, transacción o comprobante inexistente.                                                                                                   |
| 409  | MESA sin entregar o cerrada, LLEVAR fuera de `PENDIENTE_PAGO`, pago bloqueante, solicitud reutilizada con datos distintos o transición inválida. |
| 502  | Respuesta inicial inesperada de la pasarela simulada.                                                                                            |

Ejemplo de HTTP 400 por efectivo insuficiente:

```json
{
  "message": "El monto recibido es inferior al total del pedido",
  "error": "Bad Request",
  "statusCode": 400
}
```

Ejemplo de HTTP 409 por pedido MESA todavía sin entregar:

```json
{
  "message": "El pedido de mesa debe estar entregado",
  "error": "Conflict",
  "statusCode": 409
}
```

H04 conserva la liberación de mesas en `ENTREGADO` y reconoce `CERRADO` como terminal. H08 debe proporcionar la transición a `ENTREGADO` en el flujo MESA. La consulta de pedidos cobrables queda a cargo de la integración con H04.
