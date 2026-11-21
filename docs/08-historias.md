# Historias por módulo

Estado: Terminada o Pendiente. Las historias pendientes indican el motivo.

## Autenticación

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H30 | Base de datos | Rafael Gutiérrez (apoyo de Javier Cáceres: restricciones CHECK y vista `venta_confirmada`) | https://rafagdelb.atlassian.net/browse/LB-181 | H30 base de datos; [Fix/h30 restricciones base de datos](https://github.com/RGB50323/be_boilerplate_is_2026/pull/4) | Terminada |

##  Módulo 1: Menú digital y catálogo 

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H01 | Registro e inicio de sesión | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-1 | H01. Consultar el menú digital de una sucursal | Terminada |
| H02 | Gestionar platillos | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-2 | H02 - Gestionar los platillos del menú | Terminada |
| H03 | Gestionar categorías | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-3 | H03. Gestión de categorías del menú | Terminada |

## Módulo 2: Toma de pedidos 

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H04 | Pedido de mesa | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-4 | H04 - Registrar el pedido de una mesa | Terminada |
| H05 | Pedido para llevar | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-5 | H05 Hacer un pedido para llevar | Terminada |

## Módulo 3: Cocina/comandas

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H06 | Ver los pedidos pendientes en cocina | Luis Merino | https://rafagdelb.atlassian.net/browse/LB-30 | ✨ feat(H06): pedidos pendientes de cocina por sucursal en tiempo real ([BE #7](https://github.com/RGB50323/be_boilerplate_is_2026/pull/7), [FE #5](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/5)) | Terminada |
| H07 | Marcar un platillo como listo | Luis Merino | https://rafagdelb.atlassian.net/browse/LB-31 | ✨ feat(H07): marcar un platillo como listo desde cocina ([BE #21](https://github.com/RGB50323/be_boilerplate_is_2026/pull/21), [FE #16](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/16)) | Terminada |
| H08 | Entrega de platillos a la mesa | Luis Merino | https://rafagdelb.atlassian.net/browse/LB-168 | ✨ feat(H08): entrega de platillos a la mesa ([BE #22](https://github.com/RGB50323/be_boilerplate_is_2026/pull/22), [FE #17](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/17)) | Terminada |

## Módulo 5: Inventario de insumos

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H14 | Controlar el inventario de insumos clave | Luis Merino | https://rafagdelb.atlassian.net/browse/LB-32 | ✨ feat(H14): controlar el inventario de insumos clave ([BE #28](https://github.com/RGB50323/be_boilerplate_is_2026/pull/28), [FE #24](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/24)) | Terminada |
| H15 | Recibir una alerta cuando un insumo esté por agotarse | Luis Merino | https://rafagdelb.atlassian.net/browse/LB-33 | ✨ feat(H15): alertas de insumos por agotarse ([BE #32](https://github.com/RGB50323/be_boilerplate_is_2026/pull/32), [FE #28](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/28)) | Terminada |

## Módulo: Programa de lealtad

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H18 | Acumular puntos por mis compras | Henry Mauricio (apoyo de Javier Cáceres: el reembolso descuenta los puntos de la compra) | https://rafagdelb.atlassian.net/browse/LB-107 | feat(H18-H20): implementar puntos, cupones y beneficios ([BE #41](https://github.com/RGB50323/be_boilerplate_is_2026/pull/41), [FE #33](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/33)) | Terminada |
| H19 | Canjear puntos por beneficios | Henry Mauricio (apoyo de Javier Cáceres: resumen antes de confirmar, Mis cupones y cupón vigente hasta el fin del beneficio) | https://rafagdelb.atlassian.net/browse/LB-108 | feat(H18-H20): implementar puntos, cupones y beneficios ([BE #41](https://github.com/RGB50323/be_boilerplate_is_2026/pull/41), [FE #33](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/33)) | Terminada |
| H20 | Definir reglas de acumulación y canje | Henry Mauricio (apoyo de Javier Cáceres: registrar el módulo, deshabilitar la regla, solo el gerente administra y Swagger) | https://rafagdelb.atlassian.net/browse/LB-109 | feat(H18-H20): implementar puntos, cupones y beneficios ([BE #41](https://github.com/RGB50323/be_boilerplate_is_2026/pull/41), [FE #33](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/33)) | Terminada |
| H18-H20 | Simplificación del sistema de puntos, cupones y beneficios | Henry Mauricio | https://rafagdelb.atlassian.net/browse/LB-107, https://rafagdelb.atlassian.net/browse/LB-108, https://rafagdelb.atlassian.net/browse/LB-109 | Rama: `feature/H18-H20_CuponesSimplificados` (BE y FE) | Terminada |

## Módulo: Reseñas y calificaciones

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H21 | Calificar un platillo que pedí | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-75 | ✨ feat(H21): calificar un platillo que pedí ([BE #24](https://github.com/RGB50323/be_boilerplate_is_2026/pull/24), [FE #20](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/20)) | Terminada |
| H22 | Consultar las reseñas de los platillos | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-82 | ✨ feat(H22): consultar las reseñas de los platillos + paginación común ([BE #12](https://github.com/RGB50323/be_boilerplate_is_2026/pull/12), [FE #10](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/10)) | Terminada |
| H23 | Promedio de calificación de mi sucursal | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-95 | ✨ feat(H23): promedio de calificación de mi sucursal ([BE #27](https://github.com/RGB50323/be_boilerplate_is_2026/pull/27), [FE #22](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/22)) | Terminada |
| H24 | Ocultar una reseña inapropiada | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-99 | ✨ feat(H24): moderación de reseñas y ocultar con motivo ([BE #31](https://github.com/RGB50323/be_boilerplate_is_2026/pull/31), [FE #25](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/25)) | Terminada |

## Módulo: Notificaciones

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H25 | Recibir aviso cuando mi pedido para llevar esté listo | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-87 | ✨ feat(H25): aviso cuando mi pedido para llevar está listo ([BE #25](https://github.com/RGB50323/be_boilerplate_is_2026/pull/25)) | Terminada |
| H26 | Recibir la confirmación y el recordatorio de mi reservación | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-90 | ✨ feat(H26): confirmación y recordatorio de reservaciones ([BE #19](https://github.com/RGB50323/be_boilerplate_is_2026/pull/19), [FE #19](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/19)) | Terminada |
| H27 | Avisar a usuarios desde cualquier módulo | Javier Cáceres | https://rafagdelb.atlassian.net/browse/LB-69 | ✨ feat(H27): servicio común de avisos e historial de notificaciones ([BE #6](https://github.com/RGB50323/be_boilerplate_is_2026/pull/6), [FE #4](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/4)) | Terminada |

## Módulo: Dashboard

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H28 | Dashboard de ventas por sucursal | Carlos Rivas | https://rafagdelb.atlassian.net/browse/LB-54 | H28. Dashboard de ventas por sucursal ([BE #16](https://github.com/RGB50323/be_boilerplate_is_2026/pull/16), [FE #11](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/11)) | Terminada |
| H29 | Comparativo de desempeño entre sucursales | Carlos Rivas | https://rafagdelb.atlassian.net/browse/LB-55 | H29. Comparativo de desempeño entre sucursales ([FE #23](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/23); usa el endpoint de H28 del [BE #16](https://github.com/RGB50323/be_boilerplate_is_2026/pull/16)) | Terminada |

## Modulo: Reservaciones
| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H09    | Consultar la disponibilidad de mesas  | Guillermo Cáceres | https://rafagdelb.atlassian.net/browse/LB-135 | 🔥 feat(H09): consulta de disponibilidad de mesas y horarios de sucursales- #3 ([BE #3](https://github.com/RGB50323/be_boilerplate_is_2026/pull/3), [FE #2](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/2)) | Terminada |
| H10 | Reservar una mesa | Guillermo Cáceres | https://rafagdelb.atlassian.net/browse/LB-141 | Feature/h10 reservar mesas ([BE #14](https://github.com/RGB50323/be_boilerplate_is_2026/pull/14), [FE #12](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/12)) | Terminada |
| H11 | Modificar reservación de mesa | Guillermo Cáceres | https://rafagdelb.atlassian.net/browse/LB-147 | Feature/h11 modificar reservaciones ([BE #20](https://github.com/RGB50323/be_boilerplate_is_2026/pull/20), [FE #15](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/15)) | Terminada |
| H12 | Cancelar reservación de mesa | Guillermo Cáceres | https://rafagdelb.atlassian.net/browse/LB-154 | Feature/h12 cancelar reservaciones- #26 ([BE #26](https://github.com/RGB50323/be_boilerplate_is_2026/pull/26), [FE #21](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/21)) | Terminada |
| H13 | Ocupación proyectada del salón | Guillermo Cáceres | https://rafagdelb.atlassian.net/browse/LB-159 | feat(H13): vista de ocupacion proyectada con tiempo real para el gerente ([BE #34](https://github.com/RGB50323/be_boilerplate_is_2026/pull/34), [FE #26](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/26)) | Terminada |

## OTROS

| ID | Historia | Responsable | Card | PR | Estado |
|---|---|---|---|---|---|
| H31 | Login con diseño del sitio | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-200 | H31. Login con diseño del sitio | Terminada |
| H32 | Paginación reutilizable para backend y frontend | Javier Cáceres (paginación común y componente) y Rafael Gutiérrez (platillos, categorías y pedido del mesero) | https://rafagdelb.atlassian.net/browse/LB-205 | feat(H32): paginación de platillos y categorías; paginación común en [BE #12](https://github.com/RGB50323/be_boilerplate_is_2026/pull/12) y [FE #10](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/10) | Terminada |
| H33 | Correcciones finales de calidad y seguridad | Rafael Gutiérrez | https://rafagdelb.atlassian.net/browse/LB-206 | H33 Correcciones finales de calidad y seguridad | Terminada |
| H35 | Base de datos compartida en la nube (Supabase) | Carlos Rivas (apoyo de Rafael Gutiérrez y Javier Cáceres) | https://rafagdelb.atlassian.net/browse/LB-221 | 🗃️ feat(db): Usar base de datos compartida en Supabase ([BE #33](https://github.com/RGB50323/be_boilerplate_is_2026/pull/33)) | Terminada |
| — | Despliegue en Heroku (backend en contenedor Docker con migraciones en la fase *release*, frontend como app Node.js) | Luis Merino | — | 🔧 chore: configuración de deploy en Heroku ([BE #37](https://github.com/RGB50323/be_boilerplate_is_2026/pull/37)) | Terminada |
| — | Dashboard de ventas para el gerente de sucursal (solo su sucursal) | Luis Merino | — | feat(dashboard): el gerente de sucursal ve las ventas de su sucursal ([BE #38](https://github.com/RGB50323/be_boilerplate_is_2026/pull/38)) | Terminada |
| — | Imágenes de platillos en Supabase Storage | Luis Merino | — | ✨ feat(platillos): imágenes de platillos en Supabase Storage ([BE #42](https://github.com/RGB50323/be_boilerplate_is_2026/pull/42)) | Terminada |
| — | Navegación por rol en toda la aplicación | Luis Merino | — | fix: navegación por rol ([FE #29](https://github.com/RGB50323/fe_boilerplate_is_2026/pull/29)) | Terminada |
