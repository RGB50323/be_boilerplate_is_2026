# H20 · Persistencia de beneficios

`Beneficio` conserva el ID, costo positivo, marcas administrativas y relación con canjes. El nombre y la descripción se leen de `Platillo`. El catálogo es global. Si PostgreSQL permite borrar físicamente un platillo, la FK deja `platilloId` en NULL y se conservan el beneficio, los canjes y los movimientos. Las FK de pedidos y reseñas siguen restringiendo el borrado.

`Canje.nombreBeneficio` es nullable y admite 120 caracteres. H19 debe guardar el nombre del platillo al confirmar cada canje. Para canjes anteriores, la migración copia el último nombre legacy conocido cuando existe. Ese valor puede diferir del nombre a la fecha del canje. Considerar `NOT NULL` solo después de verificar la cobertura histórica y la escritura de H19.

## Vigencia y baja

H20 debe aceptar días de calendario en `America/El_Salvador` y persistir los instantes UTC en las columnas `timestamp(3)` de Prisma. El inicio es inclusivo y el fin exclusivo. Para la fecha final seleccionada, guardar el comienzo del **día siguiente** en El Salvador. Por ejemplo, si ambos días son el 20 de noviembre de 2026, guardar `2026-11-20T06:00:00.000Z` y `2026-11-21T06:00:00.000Z`. Al editar o mostrar, recuperar el último día incluido.

H20 y H19 deben consultar `vigenteDesde <= ahora < vigenteHasta`. H19 debe verificar también `deshabilitadoEn IS NULL`, platillo y categoría disponibles, oferta activa en la sucursal y existencias suficientes. H20 solo debe fijar `deshabilitadoEn` si todavía es NULL. PostgreSQL valida la duración con un CHECK y protege la baja con un trigger. Una vez fijada la fecha, el trigger rechaza borrarla o reemplazarla, y permite actualizar otros campos si se conserva la fecha. H18 conserva su esquema de acreditación y H19 sus relaciones de canje.

## Aplicación y prevalidación

1. Identificar el destino efectivo del CLI. `migrate deploy` usa `DIRECT_URL` o `DATABASE_URL`. Confirmar que efectivamente corresponde a la base local de desarrollo autorizada.
2. Antes del despliegue, revisar los IDs que devuelve `SELECT id FROM beneficio WHERE vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta <= vigente_desde ORDER BY id` en el esquema anterior. Si hay filas, recuperar sus fechas originales. La primera migración agrega la FK y conserva los nombres disponibles. La segunda aborta de forma atómica si la vigencia no se puede conservar.
3. Revisar las vigencias legacy válidas antes de reutilizar esos beneficios. La migración conserva sus instantes tal como estaban y deja todas sus FK sin asignar. Asociar un platillo solo con una correspondencia verificada y revisar las fechas según la nueva convención antes de ponerlo en oferta.
4. Ejecutar `npx prisma migrate deploy`, `npx prisma generate` y `npx prisma migrate status` contra la configuración verificada. Si la segunda migración ya quedó registrada como fallida, resolver las filas afectadas, comprobar el rollback (la migración utiliza una transacción) y marcar solo esa migración como revertida con `prisma migrate resolve --rolled-back 20261120120100_h20_vigencia_y_baja_beneficio` antes de reintentar.

La segunda migración preserva las bajas anteriores. Si una fila inactiva carece de fecha de baja, guarda el instante de migración como marca de conservación, no como fecha histórica conocida.

## Pruebas en PostgreSQL

Con `H20_TEST_DATABASE_URL` apuntando exclusivamente a la base local aislada `h20_test` con las migraciones aplicadas, ejecutar `npx vitest run prisma/h20-beneficios.spec.ts prisma/h20-migracion-historica.spec.ts`. La prueba de migración reproduce el esquema previo a H20 en un esquema de prueba único y ejecuta los archivos SQL originales. La prueba del trigger revierte sus datos mediante rollback.
