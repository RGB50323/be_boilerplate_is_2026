# H20 · API administrativa de beneficios

El módulo `src/beneficios` contiene el controlador HTTP, DTO, servicio de reglas administrativas y repositorio Prisma. NestJS aplica los guards globales de JWT y roles. `GERENTE` y `GERENTE_GENERAL` tienen los mismos permisos sobre el catálogo global, independientemente de su sucursal.

## Rutas

| Método | Ruta | Entrada y respuesta |
| --- | --- | --- |
| GET | `/api/v1/beneficios` | `pagina` desde 1 y `estado` opcional. Devuelve 10 registros por página, ordenados por ID descendente. |
| GET | `/api/v1/beneficios/:id` | ID entero positivo. Devuelve un beneficio, incluidos los registros históricos. |
| GET | `/api/v1/beneficios/platillos` | `pagina` desde 1 y `buscar` opcional de hasta 120 caracteres. Busca por nombre sin distinguir mayúsculas. Devuelve `id`, `nombre` y `descripcion` por platillo, ordenados por nombre e ID. Incluye platillos existentes aunque carezcan de oferta en la sucursal del gerente. |
| POST | `/api/v1/beneficios` | Los cuatro campos del ejemplo son obligatorios. Devuelve el beneficio creado con HTTP 201. |
| PATCH | `/api/v1/beneficios/:id` | Uno o más de los cuatro campos del ejemplo. Devuelve el beneficio actualizado con HTTP 200. |
| PATCH | `/api/v1/beneficios/:id/deshabilitar` | ID entero positivo. Devuelve el beneficio deshabilitado con HTTP 200. |

Ambos listados usan `{ datos, pagina, totalPaginas, total }`. Todas las rutas requieren sesión. Devuelven `401` sin autenticación válida, `403` para un rol ajeno a gerencia, `400` por datos inválidos y `404` por un beneficio o platillo inexistente al consultarlo o asociarlo. La edición y la baja devuelven `409` si el beneficio ya fue deshabilitado.

Entrada de ejemplo para crear

```json
{
  "platilloId": 15,
  "costoPuntos": 150,
  "vigenteDesde": "2026-11-25",
  "vigenteHasta": "2026-11-30"
}
```

Respuesta de ejemplo previa a la fecha de inicio

```json
{
  "id": 9,
  "platilloId": 15,
  "nombre": "Hamburguesa clásica",
  "descripcion": "Con vegetales y salsa",
  "costoPuntos": 150,
  "vigenteDesde": "2026-11-25",
  "vigenteHasta": "2026-11-30",
  "creadoEn": "2026-11-20T16:00:00.000Z",
  "modificadoEn": null,
  "deshabilitadoEn": null,
  "estado": "PROGRAMADO",
  "platillo": { "id": 15, "nombre": "Hamburguesa clásica", "descripcion": "Con vegetales y salsa" }
}
```

El costo y el ID de platillo deben ser enteros positivos. El mismo platillo puede asociarse a varios beneficios. Las fechas se reciben y devuelven como días calendario `YYYY-MM-DD` de El Salvador. PostgreSQL guarda inicio inclusivo y fin exclusivo al inicio del día posterior a la fecha final elegida. La edición combina las fechas enviadas con las guardadas antes de validar y actualiza `modificadoEn`. Los campos desconocidos y los valores nulos en campos editables se rechazan.

El estado del filtro y la respuesta sigue esta prioridad. `DESHABILITADO` si hay baja, `SIN_PLATILLO` si falta la relación, `PROGRAMADO` antes del inicio, `VENCIDO` desde el fin exclusivo y `VIGENTE` dentro del intervalo. Si falta el platillo, los campos descriptivos y `platillo` son nulos. La baja es definitiva y se conserva en las consultas administrativas. La edición y la baja usan un bloqueo de fila en PostgreSQL y una escritura condicionada a que la fecha de baja siga nula. El trigger protege la fecha ya registrada y los canjes históricos conservan sus datos.

## Pruebas

- Unitarias del módulo con `npx vitest run src/beneficios`.
- Integración con PostgreSQL local. Configurar `H20_TEST_DATABASE_URL` para la base aislada `h20_test` con las migraciones aplicadas, y `LOCAL_DATABASE_URL` para el mismo destino al usar la configuración E2E. Ejecutar `npm run build` y `npx vitest run --config vitest.config.e2e.ts --project e2e test/beneficios.e2e-spec.ts`.
- Pruebas de persistencia y migración en la [documentación de Prisma](./H20-beneficios-prisma.md).

H19 deberá evaluar la elegibilidad real del canje usando vigencia, baja, relación, categoría, oferta en la sucursal y existencias. El estado administrativo global por sí solo no autoriza un canje.
