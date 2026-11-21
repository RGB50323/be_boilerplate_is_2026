# API

**Documentación interactiva (Swagger):** [https://los-burle-api-01b8379425c8.herokuapp.com/api/docs](https://los-burle-api-01b8379425c8.herokuapp.com/api/docs)

Todas las rutas llevan el prefijo `/api/v1`. Los errores de validación responden `400`, sin sesión `401`, sin permiso `403`, y los conflictos de negocio `409` o `422`.

## Autenticación

1. `POST /auth/login` con correo y contraseña devuelve `accessToken`, `refreshToken` y `expiresIn` (segundos).
2. El `accessToken` (JWT) se envía en el encabezado `Authorization: Bearer <token>`. Dura 15 minutos por defecto (variable `JWT_EXPIRES_IN`).
3. `POST /auth/refresh` canjea el `refreshToken` (dura 7 días) por un par nuevo. Cada refresh token se puede usar una sola vez.
4. `POST /auth/logout` revoca el refresh token.

Toda ruta exige token salvo las marcadas como *Público*. La columna *Roles* indica qué roles pueden usarla; *Autenticado* significa cualquier usuario con sesión.

## Endpoints por módulo

### Autenticación y usuarios

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /users | Registra un cliente con correo y contraseña | Público |
| POST | /auth/login | Inicia sesión | Público |
| POST | /auth/refresh | Renueva el par de tokens | Público |
| POST | /auth/logout | Cierra la sesión | Público |
| GET | /auth/me | Devuelve el usuario autenticado | Autenticado |
| GET | / | Health check | Público |

### Menú y sucursales

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /sucursales | Lista las sucursales con sus horarios | Público |
| GET | /sucursales/:sucursalId/menu | Menú de la sucursal: categorías activas y platillos habilitados | Público |
| GET | /platillos/:id/resenas | Reseñas visibles de un platillo (ver Reseñas) | Público |

### Platillos (H02)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /sucursales/:sucursalId/platillos | Lista paginada con búsqueda | Gerente, Mesero |
| POST | /sucursales/:sucursalId/platillos | Crea un platillo en la sucursal | Gerente |
| POST | /platillos/imagen | Sube la imagen (JPG o PNG, máx. 2 MB) | Gerente |
| GET | /platillos/:id | Detalle de un platillo de su sucursal | Gerente |
| PUT | /platillos/:id | Edita un platillo | Gerente |
| PATCH | /platillos/:id/deshabilitar | Deshabilita el platillo en su sucursal | Gerente |
| PATCH | /platillos/:id/habilitar | Lo vuelve a habilitar en su sucursal | Gerente |

### Categorías (H03)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /categorias | Crea una categoría | Gerente |
| PUT | /categorias/:id | Renombra una categoría | Gerente |
| PATCH | /categorias/:id/deshabilitar | Deshabilita una categoría sin platillos activos | Gerente |
| GET | /categorias | Lista paginada, incluye las deshabilitadas | Gerente |
| GET | /categorias/activas | Lista las categorías activas sin paginar | Gerente |
| GET | /categorias/:id/platillos | Platillos activos de la categoría | Gerente |
| PATCH | /platillos/:id/categoria | Cambia la categoría de un platillo de su sucursal | Gerente |

### Pedidos (H04 y H05)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /sucursales/:sucursalId/mesas | Mesas con su pedido abierto | Mesero |
| POST | /pedidos | Crea un pedido: de mesa (`tipo: MESA`) o para llevar (`tipo: LLEVAR`) | Mesero (mesa), Cliente (llevar) |
| GET | /pedidos/:id | Pedido con sus platillos | Mesero |
| POST | /pedidos/:id/items | Agrega platillos a un pedido abierto | Mesero |
| PATCH | /pedidos/:id/items/:itemId | Cambia la cantidad o la nota | Mesero |
| DELETE | /pedidos/:id/items/:itemId | Quita un platillo | Mesero |
| GET | /pedidos/mios | Mis pedidos para llevar, paginados | Cliente |
| GET | /pedidos/:id/seguimiento | Seguimiento de un pedido para llevar propio | Cliente |
| POST | /pedidos/:id/cancelar | Cancela un pedido para llevar recibido (reembolsa y devuelve disponibilidad) | Cliente |

### Cocina

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /cocina/pedidos | Pedidos pendientes de la sucursal del usuario, del más antiguo al más reciente, con minutos de espera (H06) | Cocina, Gerente, Gerente general |
| PATCH | /cocina/items/:itemId/listo | Marca un platillo como listo y, si era el último, el pedido pasa a Listo. `404` si no existe, `403` si es de otra sucursal, `409` si ya estaba listo (H07) | Cocina, Gerente |

Tiempo real: Socket.IO en el namespace `/cocina`, autenticado con el access token (`auth: { token }`); cada usuario entra a la sala de su sucursal. Eventos: `pedido:nuevo`, `pedido:actualizado`, `pedido:retirado`, `item:listo`, `pedido:listo` y `pedido:entregado`.

### Mesero: entrega en la mesa (H08)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /mesero/items-listos | Platillos listos de los pedidos de mesa de la sucursal, ordenados por la hora en que quedaron listos | Mesero |
| PATCH | /mesero/items/:itemId/entregado | Marca un platillo como entregado (registra hora y mesero); si era el último, el pedido pasa a Entregado. `404` si no existe, `403` si es de otra sucursal, `409` si ya estaba entregado, `422` si aún no está listo | Mesero |

### Inventario (H14 y H15)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /inventario/insumos | Insumos de la sucursal con su estado (NORMAL o BAJO); filtro opcional `q` por parte del nombre | Gerente |
| POST | /inventario/insumos | Registra un insumo (`nombre`, `unidad`, `minimo`), con cantidad inicial 0. `409` si el nombre ya existe en la sucursal | Gerente |
| POST | /inventario/insumos/:id/movimientos | Registra una entrada o salida (`tipo`, `cantidad`, `motivo`) y devuelve la cantidad anterior y la actual. `422` si la salida supera la existencia | Gerente |
| GET | /inventario/insumos/:id/movimientos | Historial del insumo, del más reciente al más antiguo, paginado | Gerente |
| GET | /inventario/alertas | Alertas sin resolver (ACTIVA o VISTA) de la sucursal | Gerente |
| PATCH | /inventario/alertas/:id/vista | Marca una alerta como vista. `409` si ya estaba resuelta | Gerente |

Las alertas no se crean por endpoint: se generan o se resuelven solas al registrar un movimiento.


### Pagos (H16)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /pagos/procesar | Procesa un pago mediante la pasarela simulada. Valida el pedido, el ticket, el total y la idempotencia mediante solicitudId. Genera una transacción en estado PENDIENTE. | Cliente (LLEVAR), Mesero (MESA), Gerente general |
| GET | /pagos/transaccion/:transaccionId | Consulta los datos y el estado de una transacción de pago. | Gerente, Gerente general |
| PATCH | /pagos/transaccion/:transaccionId/estado | Actualiza el estado de una transacción, permitiendo confirmar, rechazar o reembolsar según las transiciones autorizadas. | Gerente, Gerente general |

Los pagos utilizan los estados PENDIENTE, CONFIRMADO, RECHAZADO y REEMBOLSADO. Las transiciones permitidas son PENDIENTE a CONFIRMADO o RECHAZADO, y CONFIRMADO a REEMBOLSADO.

El sistema valida que los importes coincidan con el pedido, evita solicitudes duplicadas y no permite mantener más de un pago activo por pedido.

Los pedidos PARA LLEVAR se pagan con tarjeta. Los pedidos MESA permiten efectivo o tarjeta, incluyendo el cálculo del cambio en los pagos en efectivo.

### Comprobantes de pago (H17)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /comprobantes/:id | Consulta los datos del comprobante y el snapshot del ticket asociado al pago confirmado. | Autenticado, con autorización según el pedido |
| GET | /comprobantes/:id/pdf | Genera y descarga el comprobante de pago en formato PDF, identificado como COPIA en las descargas posteriores. | Autenticado, con autorización según el pedido |

Los comprobantes se generan al confirmar el pago mediante una transacción atómica. Si falla el registro del comprobante, se revierte la confirmación.

El snapshot conserva los platillos, cantidades, precios unitarios, subtotales y total correspondientes al momento del pago.

El comprobante incluye número, fecha, pedido, sucursal, referencia de transacción, desglose de productos y total pagado.


### Acumulación de puntos (H18)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /lealtad/puntos | Consulta el saldo disponible, los puntos pendientes y el historial de movimientos del cliente autenticado. | Cliente |

Los puntos generados por un pago confirmado permanecen pendientes durante 24 horas antes de estar disponibles para canje.

### Canje de beneficios (H19)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /lealtad/beneficios | Lista los beneficios activos y vigentes disponibles para canje. | Cliente |
| GET | /lealtad/mis-cupones | Lista los cupones adquiridos por el cliente, incluyendo código y estado. | Cliente |
| POST | /lealtad/canjes | Descuenta los puntos correspondientes y genera el cupón del beneficio seleccionado. | Cliente |
| GET | /lealtad/cupones/:codigo | Verifica la validez de un cupón presentado por el cliente. | Mesero, Gerente, Gerente general |
| PATCH | /lealtad/cupones/:codigo/utilizar | Confirma la utilización del beneficio y registra el consumo del cupón. | Mesero, Gerente, Gerente general |

Los canjes utilizan una `claveIdempotencia` para evitar operaciones duplicadas. Si se repite la solicitud con la misma clave, se devuelve el cupón original.

Al verificar o utilizar un cupón, la API devuelve `404` si no existe, `409` si ya fue utilizado y `410` si expiró.

### Administración de beneficios (H20)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /lealtad/admin/beneficios | Lista los beneficios registrados y su estado administrativo. | Gerente |
| POST | /lealtad/admin/beneficios | Crea un beneficio con costo en puntos y fechas de vigencia. | Gerente |
| PATCH | /lealtad/admin/beneficios/:id | Modifica un beneficio y registra los cambios en el historial. | Gerente |
| DELETE | /lealtad/admin/beneficios/:id | Deshabilita un beneficio para futuras adquisiciones sin eliminar su registro. | Gerente |
| GET | /lealtad/admin/regla | Consulta la regla de acumulación vigente; devuelve `null` si no existe. | Gerente |
| PUT | /lealtad/admin/regla | Configura la tasa de acumulación entre 1 y 10 puntos por dólar. | Gerente |
| DELETE | /lealtad/admin/regla | Deshabilita la regla vigente y suspende nuevas acumulaciones hasta configurar otra. | Gerente |

La administración de beneficios permite controlar el costo en puntos, las fechas de vigencia y la disponibilidad de los descuentos.

Las reglas de acumulación pueden modificarse o deshabilitarse. Al deshabilitar la regla vigente, las compras posteriores dejan de acumular puntos hasta que se configure una nueva.


### Reservaciones (H09,H10,H11,H12)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/sucursales/:id/mesas-disponibles` | Mesas disponibles por 2 horas | Público |
| POST | `/reservaciones` | Reserva una mesa | Autenticado |
| GET | `/reservaciones/mias` | Mis reservaciones, paginadas | Autenticado |
| GET | `/reservaciones/R-:id` | Consulta el detalle de una reservación | Autenticado |
| PATCH | `/reservaciones/R-:id` | Modifica una reservación | Autenticado |
| GET | `/reservaciones/R-:id/mesas-disponibles` | Consulta mesas alternativas para una reservación | Autenticado |
| PATCH | `/reservaciones/R-:id/cancelar` | Cancela una reservación | Autenticado |

### Ocupación(H13)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/sucursales/:id/ocupacion` | Consulta la ocupación proyectada por hora de una sucursal | GERENTE |

### Reseñas (H21, H22, H23 y H24)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /platillos/:id/resenas | Promedio con un decimal, total, distribución de 1 a 5 estrellas y reseñas visibles paginadas (10 por página, más recientes primero) | Público |
| GET | /resenas/pendientes | Platillos de mis pedidos pagados en los últimos 7 días que todavía puedo calificar | Cliente |
| POST | /resenas | Publica una reseña: `pedidoId`, `platilloId`, `estrellas` (1 a 5) y `comentario` opcional (máx. 500). `409` si ya lo reseñó, `422` si pasaron más de 7 días del pago | Cliente |
| GET | /resenas/reporte | Reporte de la sucursal del gerente: promedio, total y distribución. Filtros opcionales `desde` y `hasta` (`YYYY-MM-DD`, incluye todo el día final); `400` si `hasta` es anterior a `desde` | Gerente |
| GET | /resenas/moderacion | Reseñas de la sucursal del gerente, 10 por página, con filtro opcional `estado` (VISIBLE u OCULTA) y el detalle de ocultación | Gerente |
| PATCH | /resenas/:id/ocultar | Oculta una reseña con `motivo` (OFENSIVO, SPAM, NO_RELACIONADO). `409` si ya estaba oculta, `403` si es de otra sucursal | Gerente |

Las reseñas ocultas no se devuelven en `/platillos/:id/resenas` ni cuentan en el promedio del menú ni en el reporte.

### Notificaciones (H25, H26 y H27)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /notificaciones | Historial del usuario, 20 por página, más recientes primero, con el total de no leídas (`noLeidas`) | Autenticado |
| PATCH | /notificaciones/:id/leida | Marca una notificación propia como leída | Autenticado |

Los avisos los generan los demás módulos con el servicio común de avisos, no con endpoints propios:

| Aviso | Cuándo se genera | Destinatario |
|---|---|---|
| Tu pedido está listo | Cocina marca listo el último platillo de un pedido para llevar | Cliente del pedido |
| Reservación confirmada, modificada o cancelada | Al crear, modificar o cancelar una reservación | Cliente de la reservación |
| Recordatorio de tu reservación | Tarea programada cada minuto, 2 horas antes del inicio | Cliente de la reservación |
| Insumo por agotarse | Un movimiento deja un insumo en su mínimo o por debajo y no había otra alerta abierta (también por correo) | Gerentes de la sucursal |

### Dashboard (H28 y H29)

El gerente general consulta todas las sucursales o la que elija; el gerente de sucursal, solo la suya. Las tres rutas reciben `desde` y `hasta` (`YYYY-MM-DD`, días completos en hora de El Salvador) y `sucursalId` opcional (sin él, todas las permitidas). `400` si `hasta` es anterior a `desde`; `404` si la sucursal no existe. Solo cuentan los pedidos con pago confirmado (vista `venta_confirmada`: subtotal menos descuentos, sin IVA ni propina), sin los reembolsados.

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /dashboard/ventas | Por sucursal: ventas, pedidos y `ticketPromedio`; `totalGeneral`; platillos más vendidos (por cantidad; en empate, mayor monto) y `horariosPico` por hora. `diaSemana` opcional (0 = domingo) filtra solo los horarios pico | Gerente general, Gerente (solo su sucursal) |
| GET | /dashboard/ventas/detalle | Una fila por pedido vendido, del más reciente al más antiguo. `pagina` (1 por defecto) y `porPagina` (20 por defecto, máximo 100); responde `{ items, total, pagina, porPagina }` | Gerente general, Gerente (solo su sucursal) |
| GET | /dashboard/ventas/exportar | Descarga `ventas-por-sucursal_{desde}_{hasta}.csv`: una fila por sucursal (`Sucursal,Ventas,Pedidos,Ticket promedio`), de mayor a menor venta, y al final `Total general` | Gerente general, Gerente (solo su sucursal) |

El gerente de sucursal recibe `403` si pide otra sucursal o si no tiene sucursal asignada.

El comparativo de sucursales (H29) usa `GET /dashboard/ventas` con el mismo periodo; no tiene un endpoint propio.

Los listados paginados reciben `pagina` (1 por defecto, máximo 1000) y devuelven 10 elementos por página; los que usan la paginación común responden `{ datos, pagina, totalPaginas, total }`. El historial de notificaciones devuelve 20 por página.

El detalle del dashboard (`/dashboard/ventas/detalle`) es la excepción: usa `porPagina` (20 por defecto, máximo 100) y responde `{ items, total, pagina, porPagina }`.
