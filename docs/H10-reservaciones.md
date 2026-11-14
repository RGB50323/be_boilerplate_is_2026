# H10: confirmar y consultar mis reservaciones

## Contrato

Ambos endpoints requieren `Authorization: Bearer <accessToken>`.

- `POST /api/v1/reservaciones`: recibe `mesaId`, `fecha` (YYYY-MM-DD), `hora` (HH:mm), `personas`, `nombre`, `telefono` (####-####) y `correo`.
- `GET /api/v1/reservaciones/mias?pagina=1`: devuelve `{ datos, pagina, totalPaginas, total }`, con 10 reservas por página, ordenadas por fecha de visita descendente e ID. Incluye únicamente las del usuario autenticado.

Ejemplo de creación:

```json
{
  "mesaId": 3,
  "fecha": "2030-11-09",
  "hora": "19:00",
  "personas": 4,
  "nombre": "Ana López",
  "telefono": "7123-4567",
  "correo": "ana@correo.com"
}
```

Respuesta 201: `{ reservacionId: "R-000045", estado: "CONFIRMADA", mesaId: 3, mesa: 2, sucursalId: 1, sucursal: "Centro", fecha: "2030-11-09", hora: "19:00", personas: 4 }`.
`mesa` es el número visible; `mesaId` es el ID de base de datos. El identificador R- se deriva del ID existente, no de un contador en memoria.

Errores: 400 con `errores` por campo, 401 sin sesión válida, 404 mesa inexistente/inactiva, 409 solapamiento. El DTO rechaza campos adicionales como `clienteId` y `cliente_id`; el propietario se obtiene exclusivamente del guard de autenticación.

## Horarios y concurrencia

Se reutiliza la validación de H09: dos horas, inicios cada 30 minutos, hora local de El Salvador y horarios de sucursal registrados. Se almacena UTC y se devuelve fecha/hora local.

No hay cambios de esquema ni seed. Es obligatorio aplicar las migraciones existentes (`npm run prisma:deploy`), en particular `20261107210255_restricciones`, que instala `btree_gist` y `reservacion_sin_solape`.

La escritura usa una consulta parametrizada de Prisma con `ON CONFLICT ON CONSTRAINT reservacion_sin_solape DO NOTHING`. PostgreSQL decide de forma atómica cuál confirmación puede insertarse; no se depende de un chequeo previo de disponibilidad ni de locks en memoria. Solo se interpreta esa restricción como 409; otros errores no se ocultan como conflictos.

## Verificación

```powershell
npm run build
npx vitest run --config vitest.config.e2e.ts test/reservaciones.e2e-spec.ts test/crear-reservacion.e2e-spec.ts
```

La prueba de concurrencia es opt-in y necesita una base **temporal y exclusiva** llamada `h10_test`, con las migraciones aplicadas. Nunca toma `DATABASE_URL` para ejecutar las pruebas. Crea y elimina sus propios registros.

```powershell
# En una terminal dedicada, apuntar ambos comandos a la base temporal.
$env:DATABASE_URL = 'postgresql://postgres:h10-test@127.0.0.1:55432/h10_test'
npx prisma migrate deploy
$env:TEST_DATABASE_URL = $env:DATABASE_URL
npx vitest run --config vitest.config.e2e.ts test/reservacion-concurrencia.e2e-spec.ts
```

Los tests HTTP usan el guard real con autenticación controlada para aislar H10. Las pruebas de concurrencia y propiedad ejecutan el servicio, repositorio y las restricciones reales de PostgreSQL. No sustituyen una prueba manual de login completo.

Alcance: crear y listar reservas propias. Cancelación, edición y vistas de administración corresponden a otras historias.
