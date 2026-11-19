# H13: Ocupación proyectada por horario

## Contrato

Endpoint de consulta:
- `GET /api/v1/sucursales/:id/ocupacion?fecha=YYYY-MM-DD`
- Requiere autenticación con `Authorization: Bearer <accessToken>`.
- Restringido exclusivamente al rol `GERENTE` de su propia sucursal (`usuario.sucursalId === :id`).
- Parámetro de consulta obligatorio: `fecha` en formato `YYYY-MM-DD` (hora local de El Salvador, UTC-6).

### Respuestas
- **200 OK**:
  ```json
  {
    "fecha": "2026-11-20",
    "sucursalId": 1,
    "sucursal": "Centro",
    "mesasActivas": 10,
    "calculable": true,
    "bloques": [
      {
        "horaInicio": "08:00",
        "horaFin": "09:00",
        "mesasReservadas": 2,
        "mesasDisponibles": 8,
        "porcentajeOcupacion": 20
      }
    ]
  }
  ```
  - `mesasActivas`: cantidad de mesas con `activa: true` en la sucursal.
  - `calculable`: `true` si `mesasActivas > 0`, `false` si no hay mesas activas.
  - `bloques`: bloques de 1 hora generados desde la hora de apertura hasta el cierre de la sucursal para el día correspondiente.
  - `porcentajeOcupacion`: `(mesasReservadas / mesasActivas) * 100` redondeado a 2 decimales; `0` si no hay reservaciones; `null` si `calculable` es `false`.
- **400 Bad Request**: Fecha inválida o fuera de rango de calendario.
- **401 Unauthorized**: Sin token o token inválido/expirado.
- **403 Forbidden**: Usuario sin rol `GERENTE`, sin sucursal asignada o intentando consultar una sucursal distinta a la suya.
- **404 Not Found**: Sucursal no encontrada.

## Eventos en tiempo real (WebSocket)

- **Namespace**: `/ocupacion`
- Requiere autenticación por token en el handshake (`auth: { token }`).
- El socket se une a la sala `sucursal:<sucursalId>`.
- **Evento emitido**: `ocupacion:actualizada` con payload `{ sucursalId, fecha }`.
- Se emite automáticamente cuando se crea, edita o cancela una reservación en esa sucursal, permitiendo al frontend refrescar la ocupación proyectada sin recargar la página. Si una edición cambia la fecha, se emite para la fecha anterior y la nueva después de confirmar el cambio.

## Verificación

```powershell
npm run build
npx vitest run src/ocupacion/services/ocupacion.service.spec.ts
npx vitest run src/ocupacion/gateways/ocupacion.gateway.spec.ts
npx vitest run --config ./vitest.config.e2e.ts test/ocupacion.e2e-spec.ts
```
