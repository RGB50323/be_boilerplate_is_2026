# H11 — Modificar reservaciones

Todos los endpoints requieren sesión. El cliente se obtiene del JWT; nunca se acepta `clienteId` en el cuerpo. Una reservación ajena se responde como inexistente.

## Contrato

- `GET /api/v1/reservaciones/mias`: listado existente de H10, paginado, conserva confirmadas y canceladas.
- `GET /api/v1/reservaciones/R-000045`: detalle propio, con `capacidad`, `horarios`, `modificadaEn` y `version` además del resumen de H10.
- `PATCH /api/v1/reservaciones/R-000045`: modifica fecha, hora, personas y, si se elige una alternativa, mesa dentro de la misma sucursal.
- `GET /api/v1/reservaciones/R-000045/mesas-disponibles?fecha=2099-11-09&hora=14:00&personas=2`: alternativas activas, con capacidad suficiente, excluyendo la propia reserva del cálculo de cruces.

Ejemplo de PATCH (usar la versión exacta recibida al consultar):

```json
{
  "mesaId": 3,
  "fecha": "2099-11-09",
  "hora": "14:00",
  "personas": 2,
  "version": "2026-11-15T12:00:00.000Z"
}
```

Respuesta 200: detalle actualizado. Errores: 400 por campos inválidos, horario, capacidad, mesa de otra sucursal o reserva cancelada; 401 sin sesión; 404 inexistente/ajena; 409 por solapamiento (`MESA_NO_DISPONIBLE`) o versión desactualizada (`RESERVA_MODIFICADA`).

## Persistencia y avisos

`modificada_en` ya existe en el esquema y migraciones de development. Se actualiza al guardar; no se añade otra columna. Se mantienen las dos horas, intervalos de 30 minutos y horario de El Salvador de H09/H10.

El bloqueo de fila y la versión evitan sobrescribir cambios de otra pestaña. La restricción PostgreSQL `reservacion_sin_solape` protege frente a confirmaciones y modificaciones simultáneas de otros clientes. Un conflicto revierte la transacción y conserva la reserva original. El recordatorio enviado se reinicia cuando cambia el inicio.

Se usa `NotificacionesService` para registrar el aviso interno en la misma transacción, con una referencia distinta por modificación. No se envían correos desde una transacción abierta. La rama H26 de avisos de reservación y recordatorios todavía no está integrada en development: su envío de correo queda fuera de este cambio. Al integrar H26 se debe conservar un único aviso por modificación y evitar duplicarlo.

## Verificación

`npm run build`, `npm test`, `npm run lint`.

Pruebas de aceptación con PostgreSQL real: crear una base temporal llamada `h11_test`, aplicar las migraciones con `DATABASE_URL` apuntando exclusivamente a esa base, y ejecutar:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:CONTRASENA@localhost:55432/h11_test'
npx vitest run --config vitest.config.e2e.ts test/edicion-reservacion.e2e-spec.ts
```

La suite cubre propiedad/sesión, validaciones, canceladas, alternativas, rollback, avisos y concurrencia tanto sobre una misma reserva como entre dos reservas distintas.

## Ajustes del review

- La resolución de destinatarios y la creación del aviso usan la misma transacción. La suite H11 se ejecuta con un pool de una conexión para cubrir este caso.
- Guardar los mismos datos no cambia la versión ni registra avisos.
- Las rutas usan el prefijo literal `R-` para no capturar `/reservaciones/mias`, independientemente del orden de los controladores.
- El repositorio traduce el conflicto SQL a un error de dominio después del rollback; el servicio no depende del formato de errores de Prisma.
- H09/H10/H11 comparten el formateo de respuestas y la consulta de disponibilidad, que admite excluir la reserva editada.
- Las suites temporales de H10 y H11 se omiten cuando `TEST_DATABASE_URL` corresponde a la otra historia, en lugar de fallar por el nombre de la base.
