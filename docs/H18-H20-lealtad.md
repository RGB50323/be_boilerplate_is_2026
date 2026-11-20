# H18–H20 · Puntos, cupones y beneficios

Todas las rutas usan el prefijo `/api/v1` y requieren `Authorization: Bearer <token>`. Los ejemplos usan fechas ISO 8601 con zona horaria. Las respuestas devuelven fechas en UTC.

## Puntos y pagos

| Método y ruta | Rol | Entrada | Respuesta |
| --- | --- | --- | --- |
| `GET /lealtad/puntos` | CLIENTE | Sin cuerpo | `{ saldoDisponible, puntosPendientes, movimientos }` |
| `POST /pagos/procesar` | Según H16 | Contrato H16 y `correoLealtad?: string` para MESA | Contrato H16 |

Cada movimiento incluye `id`, `cuentaPuntosId`, `tipo`, `puntos`, `saldoAnterior`, `saldoResultante`, `pedidoId`, `canjeId`, `reglaId`, `puntosPorDolar`, `motivo` y `fecha`. Los saldos de los movimientos reflejan el saldo contable, que incluye los puntos pendientes hasta que se liberen o se reviertan. El saldo disponible excluye esos puntos durante las primeras 24 horas.

Al confirmarse un pago, el backend multiplica el monto por la tasa vigente y redondea hacia abajo. Una cuenta de cliente inactiva, una regla ausente o un resultado de cero puntos dejan el pago sin acumulación. Los reembolsos dentro del bloqueo registran un ajuste por los puntos pendientes. Los reembolsos posteriores conservan los puntos liberados.

En LLEVAR se usa al propietario autenticado del pedido. En MESA, si se envía `correoLealtad`, debe corresponder a un único usuario activo con rol CLIENTE. El correo se conserva en el pago para resolverlo cuando se confirme la tarjeta y se excluye del comprobante. Un reintento de pago debe conservar el mismo correo, comparado sin distinguir mayúsculas.

## Cupones

| Método y ruta | Rol | Entrada | Respuesta exitosa |
| --- | --- | --- | --- |
| `GET /lealtad/beneficios` | CLIENTE | Sin cuerpo | Lista de beneficios adquiribles |
| `POST /lealtad/canjes` | CLIENTE | `{ "beneficioId": 12, "claveIdempotencia": "uuid-de-la-solicitud" }` | 201 con el cupón |
| `GET /lealtad/cupones/:codigo` | MESERO, GERENTE, GERENTE_GENERAL | Código | 200 con el cupón válido |
| `PATCH /lealtad/cupones/:codigo/utilizar` | MESERO, GERENTE, GERENTE_GENERAL | Código y cuerpo vacío | 200 con el cupón y `utilizadoEn` |

El cupón tiene esta estructura.

```json
{
  "id": 44,
  "codigo": "9b38c378f88b7a289fbb",
  "beneficio": { "id": 12, "nombre": "Limonada" },
  "expiraEn": "2026-11-20T21:05:00.000Z",
  "utilizadoEn": null
}
```

La clave de idempotencia admite hasta 64 caracteres y es única en todo el sistema. Reenviar la misma clave con el mismo cliente y beneficio recupera el registro original incluso si el cupón venció o fue utilizado. Otro uso de la misma clave devuelve 409. El saldo insuficiente devuelve 409 y un beneficio indisponible devuelve 404. La verificación o confirmación devuelve 404 para un código inexistente, 409 para uno utilizado y 410 para uno expirado.

Los cinco minutos se cuentan desde la creación del canje. La caducidad posterior del beneficio permite usar el cupón hasta su propio vencimiento. Un cupón expirado conserva su registro y el descuento de puntos.

## Administración

GERENTE y GERENTE_GENERAL operan sobre el mismo catálogo global.

| Método y ruta | Entrada | Respuesta exitosa |
| --- | --- | --- |
| `GET /lealtad/admin/beneficios` | Sin cuerpo | Beneficios con estado `ACTIVO`, `INACTIVO`, `FUTURO`, `CADUCADO` o `DESHABILITADO` |
| `POST /lealtad/admin/beneficios` | `{ nombre, descripcion?, costoPuntos, activo?, vigenteDesde, vigenteHasta }` | 201 con el beneficio creado |
| `PATCH /lealtad/admin/beneficios/:id` | Campos a editar del cuerpo de creación | 200 con el beneficio actualizado |
| `DELETE /lealtad/admin/beneficios/:id` | Sin cuerpo | 200 con el beneficio deshabilitado |
| `GET /lealtad/admin/regla` | Sin cuerpo | Regla vigente o `null` |
| `PUT /lealtad/admin/regla` | `{ "puntosPorDolar": 2 }` | 200 con la regla vigente |

La respuesta de beneficio incluye `id`, `nombre`, `descripcion`, `costoPuntos`, `activo`, `vigenteDesde`, `vigenteHasta`, `creadoEn`, `modificadoEn` y `deshabilitadoEn`. `activo` toma el valor `true` al crear si se omite. Ambas fechas son obligatorias y el fin debe ser posterior al inicio. Los beneficios deshabilitados devuelven 409 al intentar editarlos o deshabilitarlos otra vez.

La tasa es un entero de 1 a 10. Cambiarla crea una nueva versión, deshabilita las anteriores y conserva las tasas registradas en los movimientos. Las mutaciones administrativas se registran en `HistorialLealtad`.

## Migración y ejecución

Antes de aplicar la migración, ejecuta esta consulta de lectura en la base destino.

```sql
SELECT id, vigente_desde, vigente_hasta
FROM beneficio
WHERE vigente_desde IS NULL
   OR vigente_hasta IS NULL
   OR vigente_hasta <= vigente_desde;
```

Si aparecen filas, determina las fechas válidas con el responsable de esos datos. La migración aborta ante esos casos y conserva las filas. Si la consulta devuelve cero filas, apunta las variables de entorno de Prisma a la base elegida y ejecuta los comandos siguientes.

```powershell
npm.cmd run prisma:deploy
npm.cmd run prisma:generate
npm.cmd start
```

Para probar manualmente, inicia sesión como gerente, configura una regla y crea un beneficio con vigencia actual. Confirma un pago de un cliente y consulta sus puntos pendientes. Con un cliente que tenga puntos ya liberados, adquiere el beneficio, verifica el código como mesero y confirma la entrega.

Para las pruebas automatizadas, establece `LOCAL_DATABASE_URL` a un PostgreSQL local con permiso para crear bases de pruebas. Vitest prepara `h18_h20_test` y `h17_test` allí.

```powershell
npm.cmd test
npm.cmd run test:e2e -- --project h18_h20 --project h17
```

## Reconstrucción local con migraciones canónicas

El destino auditado fue `127.0.0.1:5433`, base `si_be_boilerplate`, esquema `public`, usuario `postgres`. La aplicación lo lee de `DATABASE_URL`. La reconstrucción propuesta crea `si_be_boilerplate_h18_h20` en el mismo servidor y conserva la base original para respaldo y conciliación.

Un borrado de la base original perdería los siguientes datos según el inventario local del 20 de noviembre de 2026.

| Módulo | Filas |
| --- | --- |
| Identidad | 8 usuarios y 122 tokens de sesión |
| Restaurante y menú | 2 sucursales, 14 horarios, 12 mesas, 5 categorías, 12 platillos y 24 relaciones platillo–sucursal |
| Pedidos y cobros | 42 pedidos, 75 detalles, 31 pagos y 23 comprobantes |
| Notificaciones | 11 notificaciones |
| Lealtad | 4 beneficios, 1 cuenta, 2 reglas, 2 movimientos, 1 registro administrativo y 4 acreditaciones antiguas |
| Historial Prisma | 18 registros de migraciones |

El catálogo original tiene 2 beneficios deshabilitados y todos los beneficios están vinculados a platillos. Hay 2 acreditaciones liberadas, 1 pendiente y 1 cancelada. Los canjes, las compras antiguas, el inventario, las alertas, las reservaciones y las reseñas estaban vacíos. El seed repone datos de demostración. Los pedidos, cobros, sesiones y demás datos históricos requieren una transferencia explícita.

### Respaldar y crear el destino en paralelo

Ejecuta estos pasos desde la raíz del backend con los binarios de PostgreSQL 18 disponibles. `-W` solicita la contraseña en el cliente de PostgreSQL.

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$respaldo = Join-Path $env:USERPROFILE ("si_be_boilerplate-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".dump")
& "$pgBin\pg_dump.exe" -h 127.0.0.1 -p 5433 -U postgres -W -Fc -f $respaldo si_be_boilerplate
if ($LASTEXITCODE -ne 0) { throw 'Falló el respaldo' }
& "$pgBin\pg_restore.exe" --list $respaldo
if ($LASTEXITCODE -ne 0) { throw 'El archivo de respaldo no es legible' }
& "$pgBin\createdb.exe" -h 127.0.0.1 -p 5433 -U postgres -W si_be_boilerplate_h18_h20
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el destino vacío' }
```

Carga la conexión del archivo `.env`, verifica el destino original y cambia solo el nombre de la base para esta sesión de PowerShell. La contraseña queda en las variables de la sesión.

```powershell
$destinoRebuild = node -e "const e=require('dotenv').parse(require('node:fs').readFileSync('.env')); const u=new URL(e.DATABASE_URL); if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='5433'||u.username!=='postgres'||u.pathname!=='/si_be_boilerplate'||(u.searchParams.get('schema')||'public')!=='public'||u.searchParams.has('host')||u.searchParams.has('hostaddr')) throw Error('DATABASE_URL no coincide con el destino auditado'); u.pathname='/si_be_boilerplate_h18_h20'; process.stdout.write(u.href)"
if ($LASTEXITCODE -ne 0 -or !$destinoRebuild) { throw 'No se pudo preparar la conexión de reconstrucción' }
$env:DATABASE_URL = $destinoRebuild
$env:DIRECT_URL = $destinoRebuild
$env:LOCAL_DATABASE_URL = $destinoRebuild
npm.cmd run prisma:deploy
if ($LASTEXITCODE -ne 0) { throw 'Falló la aplicación de las migraciones' }
npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
if ($LASTEXITCODE -ne 0) { throw 'El destino difiere de schema.prisma' }
npm.cmd run prisma:generate
```

Para una base de demostración vacía, ejecuta `npm.cmd run db:seed`. El seed actual no inserta beneficios ni reglas de puntos. Crea ambos desde la API para probar canjes con datos demo.

Para conservar datos históricos, importa las filas de los módulos operativos con sus claves y secuencias y adapta los datos de lealtad antes de cambiar la conexión de la aplicación. Recupera o acuerda el nombre de cada beneficio y su descripción. Conserva las fechas de baja y deriva el estado administrativo con revisión de los datos. Concilia las acreditaciones y los movimientos con los pagos y saldos para evitar dobles créditos y conservar el bloqueo que corresponda. Restaura un respaldo completo únicamente en una base de recuperación, ya que su esquema y su historial contienen las migraciones antiguas. Valida conteos, claves, saldos y los flujos H16–H20 antes del cambio de conexión.
