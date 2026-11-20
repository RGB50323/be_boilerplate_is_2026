# SI Backend Boilerplate

API REST construida con **NestJS 12**, **Prisma 7** y **PostgreSQL 18**, con autenticación por usuario y contraseña lista para usar.

---

## Tabla de contenidos

- [Stack técnico](#stack-técnico)
- [Requisitos previos](#requisitos-previos)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos compartida (Supabase)](#base-de-datos-compartida-supabase)
- [Cómo levantar el proyecto](#cómo-levantar-el-proyecto)
  - [Opción A: todo con Docker](#opción-a-todo-con-docker)
  - [Opción B: Postgres en Docker + API en el host](#opción-b-postgres-en-docker--api-en-el-host-recomendado-para-desarrollar)
- [Docker en detalle](#docker-en-detalle)
- [Prisma en detalle](#prisma-en-detalle)
- [Autenticación](#autenticación)
- [Endpoints](#endpoints)
- [Cocina: pedidos pendientes (H06)](#cocina-pedidos-pendientes-h06)
- [Mesero: entrega de platillos (H08)](#mesero-entrega-de-platillos-h08)
- [Dashboard de ventas (H28)](#dashboard-de-ventas-h28)
- [Paginación común](#paginación-común)
- [Arquitectura por capas](#arquitectura-por-capas)
- [Path aliases](#path-aliases)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Scripts disponibles](#scripts-disponibles)

---

## Stack técnico

| Tecnología | Versión | Para qué se usa |
|---|---|---|
| [NestJS](https://nestjs.com) | 12 | Framework HTTP. Módulos, inyección de dependencias, guards y pipes |
| [TypeScript](https://www.typescriptlang.org) | 6 | Tipado estático. El proyecto es **ESM puro** (`"type": "module"`) |
| [Prisma ORM](https://www.prisma.io) | 7 | ORM y motor de migraciones versionadas |
| [PostgreSQL](https://www.postgresql.org) | 18 | Base de datos relacional |
| [@nestjs/jwt](https://github.com/nestjs/jwt) | 12 | Firma y verificación de los JWT de acceso |
| [Socket.IO](https://socket.io) + [@nestjs/websockets](https://docs.nestjs.com/websockets/gateways) | 4 / 12 | Eventos en tiempo real (tablero de cocina) |
| [@nestjs/event-emitter](https://docs.nestjs.com/techniques/events) | 12 | Bus de eventos interno entre módulos y gateways |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | 6 | Hasheo de contraseñas (cost 12 por defecto) |
| [class-validator](https://github.com/typestack/class-validator) | 0.15 | Validación declarativa de los DTO de entrada |
| [Swagger](https://docs.nestjs.com/openapi/introduction) | 12 | Documentación OpenAPI en `/api/docs` |
| [tsc-alias](https://github.com/justkey007/tsc-alias) | 1 | Reescribe los path aliases del JS compilado (ver [Path aliases](#path-aliases)) |
| [Vitest](https://vitest.dev) | 4 | Tests unitarios y e2e |
| [oxlint](https://oxc.rs) | 1 | Linter (con chequeos type-aware) |

### Dos detalles del stack que conviene saber

**El proyecto es ESM puro.** `package.json` declara `"type": "module"` y el `tsconfig.json` usa `moduleResolution: nodenext`. En la práctica: **todo import relativo lleva la extensión `.js`**, incluso apuntando a un archivo `.ts`.

```ts
import { AuthService } from './auth.service.js'; // ✅
import { AuthService } from './auth.service';    // ❌ falla en runtime
```

**Prisma 7 no lee la conexión desde `schema.prisma`.** A diferencia de versiones anteriores, la connection string se entrega en tiempo de ejecución mediante un *driver adapter* (`@prisma/adapter-pg`). Eso ocurre en [prisma.service.ts](src/prisma/prisma.service.ts). El CLI, por su lado, la toma de [prisma.config.ts](prisma.config.ts).

---

## Requisitos previos

- **Node.js ≥ 20.19** (recomendado 22 o 24). Prisma 7 requiere `^20.19 || ^22.12 || >=24`
- **Docker** y **Docker Compose v2+**
- **npm**, **yarn** o **pnpm**

---

## Variables de entorno

Copiá la plantilla y ajustá lo que necesites:

```bash
cp .env.example .env
```

| Variable | Default | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | Entorno de ejecución |
| `PORT` | `3000` | Puerto HTTP de la API |
| `POSTGRES_USER` | `postgres` | Usuario que crea el contenedor de Postgres |
| `POSTGRES_PASSWORD` | `postgres` | Contraseña de ese usuario |
| `POSTGRES_DB` | `si_be_boilerplate` | Base que se crea al inicializar |
| `POSTGRES_PORT` | `5432` | Puerto publicado en el host |
| `DATABASE_URL` | — | **Obligatoria.** Connection string que usa la API y el seed. Con Supabase: transaction pooler (puerto 6543) con `?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt` |
| `DIRECT_URL` | — | Connection string que usa el CLI de Prisma. Con Supabase: session pooler (puerto 5432). Si no existe, el CLI usa `DATABASE_URL` |
| `LOCAL_DATABASE_URL` | — | Postgres local de Docker. **Obligatoria** para `prisma:migrate`, `db:reset` y `test:e2e`, que borran datos. Tiene que ser `localhost`, `127.0.0.1` o `::1` |
| `TEST_DATABASE_URL`, `PAGOS_TEST_DATABASE_URL` | — | No van en `.env`: `test:e2e` las fija hacia la base temporal local de H10, H11 y H17. Si se definen a mano, tienen que ser locales |
| `JWT_SECRET` | — | **Obligatoria.** Mínimo 32 caracteres |
| `JWT_EXPIRES_IN` | `15m` | Vigencia del access token |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | `7` | Vigencia del refresh token |
| `BCRYPT_SALT_ROUNDS` | `12` | Cost factor de bcrypt |
| `COCINA_MINUTOS_RETRASO` | `15` | Minutos de espera a partir de los cuales un pedido en cocina sale como `retrasado` |

> La app **valida el entorno al arrancar** ([env.validation.ts](src/config/env.validation.ts)). Si falta `DATABASE_URL` o `JWT_SECRET`, o si el secreto es más corto que 32 caracteres, falla de inmediato con un mensaje claro en lugar de romperse más tarde.

Generá un secreto real con:

```bash
openssl rand -base64 32
```

> **Ojo con el host de la base.** Si corrés la API en tu máquina, `DATABASE_URL` apunta a `localhost`. Si la corrés dentro de Compose, el host es el nombre del servicio (`postgres`); eso ya lo resuelve `docker-compose.yml` sobreescribiendo la variable.

---

## Base de datos compartida (Supabase)

El equipo trabaja sobre **una sola base PostgreSQL en Supabase** (H35). Prisma sigue siendo el ORM y el dueño de las migraciones; de Supabase solo usamos la base (no Auth, Storage ni la Data API, que está deshabilitada).

### Conectarte

1. Pedí la contraseña de la base a quien administra el proyecto de Supabase. **No va en el repo ni en chats públicos.**
2. En Supabase, entrá a **Connect** y copiá las dos cadenas del pooler a tu `.env` (ver [.env.example](.env.example)):
   - `DATABASE_URL`: *Transaction pooler* (puerto **6543**) + `?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt`.
   - `DIRECT_URL`: *Session pooler* (puerto **5432**).
3. `npm ci` y `npm start`. No hace falta migrar ni correr el seed: la base ya está al día.
4. Para comprobar la conexión: `npm run db:verificar`. Muestra el destino (sin contraseña), si la conexión va cifrada, si el certificado se validó y cuántas migraciones tiene la base.

> **Docker Compose no usa Supabase.** `docker compose up` (Opción A) conecta la API del contenedor **siempre** al Postgres local de [docker-compose.yml](docker-compose.yml); tener la URL de Supabase en `.env` no cambia eso. Para trabajar con la base compartida, corré la API en el host con `npm start`.

### Conexión segura (SSL)

La API se conecta con `sslmode=verify-full`: la conexión va cifrada, se valida el certificado contra el CA de Supabase y se comprueba que el host coincida. El CA es público y vive en [certs/supabase-ca.crt](certs/README.md); el contenedor de despliegue lo incluye. **No uses `sslmode=no-verify`**: cifra, pero acepta cualquier certificado. Para el backend desplegado se usa la misma `DATABASE_URL`.

### Reglas para no romperle la base a nadie

- **Todo lo que borra datos va a la base local de Docker, nunca a Supabase.** [prisma.config.ts](prisma.config.ts) manda `migrate dev`, `migrate reset`, `db push` y `db execute` a `LOCAL_DATABASE_URL`. Esa variable es obligatoria para esos comandos (no se usa `DIRECT_URL` ni `DATABASE_URL` como respaldo) y tiene que apuntar a `localhost`, `127.0.0.1` o `::1`; si no, el comando falla. Las reglas están en [prisma/destinos-base.ts](prisma/destinos-base.ts) y sus pruebas en `destinos-base.spec.ts`.
- **Las migraciones se aplican a Supabase solo desde `development`**, después de mergear el PR que las trae, con `npm run prisma:deploy`. Lo hace quien mergea y avisa al equipo.
- **Después de cada merge con migraciones**, todos hacen `git pull` y `npm ci` (o `npx prisma generate`) para que su cliente de Prisma conozca las columnas nuevas.
- **El seed no duplica datos, pero restaura los de ejemplo.** Cada corrida devuelve a su estado inicial los pedidos de ejemplo (C-, E- y R-) y las reseñas de demo; si alguien los estaba usando, pierde esos cambios. Se corre solo cuando cambia (`npm run db:seed`) y avisando al equipo.
- **Los datos de prueba son de todos.** Si necesitás un escenario raro (borrar, dejar estados inconsistentes), hacelo en la base local.

### Cambiar el schema (nueva migración)

```bash
docker compose up -d postgres                # base local de pruebas
npm run prisma:migrate -- --name mi_cambio   # crea la migración contra LOCAL_DATABASE_URL
```

Para probar tu rama con la columna nueva antes del merge, apuntá temporalmente `DATABASE_URL` a la base local (y comentá `DIRECT_URL`). Supabase recibe la migración recién cuando el PR entra a `development`.

### Pruebas contra la base local

Ninguna prueba que escriba en la base corre contra Supabase. Necesitan el Postgres de Docker (`docker compose up -d postgres`) y `LOCAL_DATABASE_URL` en el `.env`; si esa variable falta o no es local, `test:e2e` no arranca.

```bash
npm run build      # algunas e2e importan desde dist/
npm run test:e2e   # corre TODAS las e2e de una vez
```

[vitest.config.e2e.ts](vitest.config.e2e.ts) divide la corrida en proyectos, cada uno con su base:

| Proyecto | Pruebas | Base |
|---|---|---|
| `e2e` | Todas las demás | `LOCAL_DATABASE_URL` |
| `h10` | [reservacion-concurrencia](test/reservacion-concurrencia.e2e-spec.ts) | `h10_test` |
| `h11` | [edicion-reservacion](test/edicion-reservacion.e2e-spec.ts) | `h11_test` |
| `h17` | [pagos-ticket-snapshot](test/pagos-ticket-snapshot.e2e-spec.ts) | `h17_test` |

H10, H11 y H17 necesitan una base exclusiva. Antes de correrlas, [test/preparar-bases-temporales.ts](test/preparar-bases-temporales.ts) crea su base en el mismo servidor de `LOCAL_DATABASE_URL` (si no existe) y le aplica las migraciones pendientes, con todas las variables de base apuntando a esa base temporal: `prisma migrate deploy` no puede llegar a Supabase. No hay que configurar nada más.

Para correr solo una: `npm run test:h10`, `test:h11` o `test:h17`.

> **No apliques migraciones cambiando solo `DATABASE_URL` en la terminal** (`$env:DATABASE_URL=...; npx prisma migrate deploy`): el CLI usa primero `DIRECT_URL` del `.env`, que es Supabase, y aplicaría las migraciones de tu rama a la base compartida.

---

## Cómo levantar el proyecto

### Opción A: todo con Docker

Levanta Postgres y la API juntos. La API aplica las migraciones pendientes al arrancar.

> Esta opción usa **solo el Postgres local** del contenedor, aunque tu `.env` tenga la URL de Supabase. Para trabajar con la base compartida usá `npm start` (ver [Base de datos compartida](#base-de-datos-compartida-supabase)).

```bash
cp .env.example .env
docker compose up --build
```

Listo: la API queda en `http://localhost:3000/api/v1` y la documentación en `http://localhost:3000/api/docs`.

Para cargar el usuario de prueba:

```bash
docker compose exec api npx prisma db seed
```

### Opción B: Postgres en Docker + API en el host (recomendado para desarrollar)

Te da hot reload y stack traces directos, usando el mismo Postgres del contenedor.

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Solo la base
docker compose up -d postgres

# 3. Dependencias (el postinstall genera el cliente de Prisma)
npm install          # o: yarn install  /  pnpm install

# 4. Aplicar migraciones y cargar el usuario demo
npm run prisma:migrate
npm run db:seed

# 5. Arrancar en watch mode
npm run start:dev
```

<details>
<summary>Equivalencias con yarn y pnpm</summary>

| npm | yarn | pnpm |
|---|---|---|
| `npm install` | `yarn install` | `pnpm install` |
| `npm run start:dev` | `yarn start:dev` | `pnpm start:dev` |
| `npm run prisma:migrate` | `yarn prisma:migrate` | `pnpm prisma:migrate` |
| `npm run db:seed` | `yarn db:seed` | `pnpm db:seed` |

</details>

Verificá que responde:

```bash
curl http://localhost:3000/api/v1
# Hello World!
```

---

## Docker en detalle

Hay dos piezas, con responsabilidades distintas:

### `docker-compose.yml` — orquesta el entorno

Define dos servicios:

**`postgres`** levanta el motor de base de datos para desarrollo local, usando la imagen oficial `postgres:18-alpine`. Tiene tres detalles importantes:

- **Volumen nombrado `pgdata`**, así los datos sobreviven a `docker compose down`.
- **Montado en `/var/lib/postgresql`**, *no* en `/var/lib/postgresql/data`. Postgres 18 cambió el layout y guarda los datos en un subdirectorio con el número de major version; usar la ruta vieja hace que el contenedor entre en un loop de reinicios.
- **`healthcheck` con `pg_isready`**, para que el servicio `api` no arranque hasta que la base acepte conexiones. Sin esto las migraciones fallan de forma intermitente al levantar todo junto.

**`api`** construye y corre la aplicación a partir del `Dockerfile`, espera el healthcheck de `postgres` (`condition: service_healthy`) y al arrancar ejecuta `prisma migrate deploy && node dist/main.js`.

### `Dockerfile` — construye la imagen de la API

Es multi-stage, en tres etapas:

1. **`deps`** — instala dependencias. Copia `prisma/` y `prisma.config.ts` **antes** de `npm ci`, porque el `postinstall` corre `prisma generate` y necesita el schema. Usa un `DATABASE_URL` placeholder: `generate` lee la variable aunque no se conecte a la base.
2. **`builder`** — compila TypeScript a `dist/` y elimina las devDependencies.
3. **`runner`** — imagen final sobre `node:24-alpine`, corriendo como el usuario sin privilegios `node`.

> **Por qué `prisma` y `dotenv` son `dependencies` y no `devDependencies`:** el contenedor ejecuta `prisma migrate deploy` al arrancar, y el `npm prune --omit=dev` del build se las llevaría. Es la diferencia entre la imagen arrancando y quedándose en un loop de reinicios.

> El schema usa `engineType = "client"`, que no descarga el motor nativo de Rust. Por eso Alpine funciona sin tener que instalar `libssl`.

### Comandos útiles

```bash
docker compose up -d postgres        # solo la base
docker compose up --build            # todo, reconstruyendo la imagen
docker compose ps                    # estado y healthchecks
docker compose logs -f api           # logs de la API
docker compose down                  # parar (los datos se conservan)
docker compose down -v               # parar y BORRAR los datos

# Abrir una consola psql dentro del contenedor
docker compose exec postgres psql -U postgres -d si_be_boilerplate
```

**Resetear la base desde cero:**

```bash
docker compose down -v && docker compose up -d postgres
npm run prisma:migrate && npm run db:seed
```

---

## Prisma en detalle

El schema vive en [prisma/schema.prisma](prisma/schema.prisma) y define dos modelos: `User` y `RefreshToken`.

La configuración del CLI está en [prisma.config.ts](prisma.config.ts) (rutas del schema y las migraciones, comando de seed, y de dónde sale `DATABASE_URL`).

### El cliente generado no se commitea

El generador `prisma-client` escribe en `src/generated/prisma`, que está en `.gitignore`. Se regenera solo en cada `npm install` gracias al script `postinstall`. Si tocás el schema:

```bash
npm run prisma:generate
```

> El `output` tiene que caer dentro de `src/` porque `tsconfig.build.json` compila únicamente ese directorio.

### Flujo de trabajo con migraciones

```bash
# Crear y aplicar una migración nueva (desarrollo)
npm run prisma:migrate -- --name agrega_campo_x

# Aplicar migraciones pendientes sin generar ninguna (producción / CI)
npm run prisma:deploy

# Explorar los datos en una UI web
npm run prisma:studio

# Borrar la base, re-aplicar todas las migraciones y correr el seed
npm run db:reset
```

### Seed

[prisma/seed.ts](prisma/seed.ts) carga datos de prueba mediante `upsert`, así que se puede correr las veces que haga falta.

Todos los usuarios tienen la contraseña `Demo1234!`:

| Email | Rol | Sucursal |
|---|---|---|
| `demo@example.com` | `CLIENTE` | — |
| `mesero@example.com` | `MESERO` | Centro |
| `cocina@example.com` | `COCINA` | Centro |
| `gerente@example.com` | `GERENTE` | Centro |
| `gerente.general@example.com` | `GERENTE_GENERAL` | — |

Además crea dos sucursales (Centro y Escalón), mesas, el menú y pedidos de ejemplo para el tablero de cocina. La hora de llegada se recalcula en cada corrida:

| Pedido | Sucursal | Caso | ¿Aparece en cocina? |
|---|---|---|---|
| `C-0001` | Centro | Mesa 3, más de 15 minutos de espera | Sí, `retrasado` |
| `C-0002` | Centro | Para llevar en `RECIBIDO` con pago confirmado | Sí |
| `C-0003` | Centro | Mesa 1, recién llegado | Sí |
| `C-0004` | Centro | Para llevar en `PENDIENTE_PAGO` | No |
| `C-0005` | Centro | Todos los ítems `LISTO` | No |
| `E-0001` | Escalón | Mesa 2, más de 15 minutos de espera | Solo para Escalón |
| `E-0002` | Escalón | Para llevar | Solo para Escalón |

También crea **pedidos de demostración** (`DEMO-00001`, …) de los últimos 45 días para el dashboard de ventas, con pagos confirmados, pendientes, rechazados y reembolsados. No tienen mesa y sus ítems ya están cerrados, así que no aparecen en cocina. Si ya existen no se duplican; para regenerarlos con fechas recientes usá `npm run db:reset`.

---

## Autenticación

Esquema **access token + refresh token**, solo con email y contraseña.

- **Access token** — JWT firmado con HS256, vida corta (15 min). Viaja en `Authorization: Bearer <token>`. Es stateless: no se consulta la base para validar la firma.
- **Refresh token** — string opaco de 32 bytes aleatorios, con vida larga (7 días). Sirve únicamente para pedir un access token nuevo.

### Decisiones de seguridad

**Las contraseñas se hashean con bcrypt** (cost 12, configurable). Nunca se guardan ni se devuelven en claro: los controladores responden un DTO explícito ([user-response.dto.ts](src/users/dto/user-response.dto.ts)) en vez de la fila de Prisma, para que `passwordHash` no pueda filtrarse por descuido.

**Los refresh tokens se guardan hasheados con SHA-256**, no con bcrypt. Es deliberado: son 32 bytes aleatorios, o sea alta entropía, así que no hay un espacio de búsqueda que justifique un KDF lento; además hace falta buscarlos por hash en un índice (bcrypt usa un salt distinto por hash, así que no se puede indexar). bcrypt queda para las contraseñas, que sí son de baja entropía. Si se filtra la base, los refresh tokens emitidos no son utilizables.

**El email se normaliza a minúsculas y sin espacios.** El índice único de Postgres es sensible a mayúsculas, así que sin normalizar `Demo@mail.com` y `demo@mail.com` serían dos cuentas distintas y el login fallaría según cómo el usuario escribiera su email. Se normaliza en dos lugares a propósito: el decorador [`@IsNormalizedEmail()`](src/common/decorators/is-normalized-email.decorator.ts) cubre lo que entra por HTTP —y tiene que correr **antes** de `@IsEmail`, o un email con espacios se rechaza con un 400 antes de poder limpiarlo—, y `UserRepository` normaliza de nuevo al leer y escribir, para cubrir a cualquier llamador interno que no pase por un DTO.

**Rotación con detección de reúso.** Cada `POST /auth/refresh` revoca el token usado y emite uno nuevo. Si llega un refresh token que ya fue canjeado, se asume robo y se revocan **todas** las sesiones del usuario.

**Login que no filtra información.** Email no registrado, contraseña incorrecta y cuenta inactiva devuelven exactamente el mismo `401` con el mismo mensaje. Cuando el email no existe igual se ejecuta un `bcrypt.compare` contra un hash descartable, para que la diferencia de tiempo de respuesta no permita enumerar qué emails tienen cuenta.

**Todo cerrado por defecto.** `JwtAuthGuard` está registrado como guard global; las rutas públicas se abren explícitamente con `@Public()`. Olvidarse del decorador deja el endpoint protegido, que es el error seguro.

**El usuario se relee en cada request**, así una cuenta desactivada o borrada deja de funcionar al instante, sin esperar a que expire el token.

**Autorización por rol.** El access token lleva `sub`, `email`, `rol` y `sucursalId`. El frontend usa esos claims para decidir qué vistas mostrar. El backend no autoriza con ellos: `RolesGuard` (global, corre después de `JwtAuthGuard`) usa el rol del usuario releído de la base. Una ruta se restringe con `@Roles(Rol.COCINA, ...)`; sin el decorador queda abierta a cualquier usuario autenticado.

### Buenas prácticas REST aplicadas

- **Versionado en la URI:** todo cuelga de `/api/v1`.
- **Sustantivos en plural para los recursos:** crear un usuario es `POST /users`, no `POST /createUser`.
- **Códigos de estado correctos:** `201` al crear, `200` en login, `204` en logout (sin cuerpo), `400` de validación, `401` de autenticación, `403` de autorización, `409` de conflicto.
- **Validación estricta de la entrada:** `whitelist` descarta propiedades no declaradas y `forbidNonWhitelisted` rechaza la request si vienen de más, en vez de ignorarlas en silencio.
- **Errores con forma consistente:** `{ message, error, statusCode }`.

---

## Endpoints

Base: `http://localhost:3000/api/v1` · Documentación interactiva: `http://localhost:3000/api/docs`

| Método | Ruta | Auth | Código | Descripción |
|---|---|---|---|---|
| `GET` | `/` | — | `200` | Health check |
| `POST` | `/users` | — | `201` | Registra un usuario con email y contraseña |
| `POST` | `/auth/login` | — | `200` | Inicia sesión con email y contraseña |
| `POST` | `/auth/refresh` | — | `200` | Renueva el par de tokens |
| `POST` | `/auth/logout` | — | `204` | Cierra la sesión |
| `GET` | `/auth/me` | Bearer | `200` | Usuario autenticado |
| `GET` | `/cocina/pedidos` | Bearer · `COCINA`, `GERENTE`, `GERENTE_GENERAL` | `200` | Pedidos pendientes de cocina de la sucursal del usuario |
| `PATCH` | `/cocina/items/:itemId/listo` | Bearer · `COCINA`, `GERENTE` | `200` | Marca un platillo como listo (H07) |
| `GET` | `/mesero/items-listos` | Bearer · `MESERO` | `200` | Platillos listos por entregar en las mesas de la sucursal (H08) |
| `PATCH` | `/mesero/items/:itemId/entregado` | Bearer · `MESERO` | `200` | Marca un platillo como entregado (H08) |
| `GET` | `/inventario/insumos` | Bearer · `GERENTE` | `200` | Insumos de la sucursal del gerente, con búsqueda y estado (H14) |
| `POST` | `/inventario/insumos` | Bearer · `GERENTE` | `201` | Registra un insumo con cantidad inicial 0 (H14) |
| `POST` | `/inventario/insumos/:id/movimientos` | Bearer · `GERENTE` | `201` | Registra una entrada o salida del insumo (H14) |
| `GET` | `/inventario/insumos/:id/movimientos` | Bearer · `GERENTE` | `200` | Historial paginado de movimientos del insumo (H14) |
| `GET` | `/inventario/alertas` | Bearer · `GERENTE` | `200` | Alertas sin resolver de la sucursal del gerente (H15) |
| `PATCH` | `/inventario/alertas/:id/vista` | Bearer · `GERENTE` | `200` | Marca una alerta como vista (H15) |
| `GET` | `/dashboard/ventas` | Bearer · `GERENTE_GENERAL`, `GERENTE` | `200` | Ventas por sucursal con ticket promedio, total general, platillos y horarios pico |
| `GET` | `/dashboard/ventas/detalle` | Bearer · `GERENTE_GENERAL`, `GERENTE` | `200` | Ventas confirmadas, una por pedido, paginadas |
| `GET` | `/dashboard/ventas/exportar` | Bearer · `GERENTE_GENERAL`, `GERENTE` | `200` | CSV de ventas por sucursal y total general |

### Ejemplos

```bash
BASE=http://localhost:3000/api/v1
```

**Registro**

```bash
curl -X POST $BASE/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"nestor@example.com","password":"Str0ngPass"}'
```

```jsonc
// 201 Created
{
  "id": "29bda5e8-e0c8-4ec2-bc7f-94c41c3c0140",
  "email": "nestor@example.com",
  "isActive": true,
  "createdAt": "2026-09-20T17:29:59.852Z"
}
```

La contraseña debe tener entre 8 y 72 caracteres, con al menos una minúscula, una mayúscula y un número. Si el email ya está registrado, la respuesta es `409 Conflict`.

**Login**

```bash
curl -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Demo1234!"}'
```

```jsonc
// 200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "dbfcf084b4a238cf9afaaa2f800ee216...",
  "expiresIn": 900,
  "user": { "id": "...", "email": "demo@example.com", "isActive": true, "createdAt": "..." }
}
```

**Ruta protegida**

```bash
curl $BASE/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Renovar tokens**

```bash
curl -X POST $BASE/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

Devuelve un par nuevo y revoca el anterior. Reusar un refresh token ya canjeado responde `401` y cierra todas las sesiones del usuario.

**Logout**

```bash
curl -X POST $BASE/auth/logout \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

Responde `204 No Content`. Es idempotente: repetirlo con un token ya revocado también devuelve `204`, para no convertirse en un oráculo que revele qué tokens existen.

---

## Cocina: pedidos pendientes (H06)

El tablero de cocina carga la cola con un `GET` y después se mantiene al día por Socket.IO, sin recargar.

### `GET /cocina/pedidos`

```bash
curl $BASE/cocina/pedidos -H "Authorization: Bearer $ACCESS_TOKEN"
```

```jsonc
// 200 OK — del más antiguo al más reciente
[
  {
    "id": 41,
    "numero": "C-0001",
    "tipo": "MESA",              // "MESA" | "LLEVAR"
    "destino": "Mesa 3",         // "Mesa N" o "Para llevar"
    "mesaNumero": 3,             // null en pedidos para llevar
    "creadoEn": "2026-11-06T05:40:00.000Z",
    "minutosEspera": 22,         // calculado por el servidor al responder
    "retrasado": true,           // minutosEspera > COCINA_MINUTOS_RETRASO
    "items": [
      { "id": 101, "platillo": "Hamburguesa", "cantidad": 2, "nota": "Una sin cebolla", "estado": "PENDIENTE", "listoEn": null },
      { "id": 102, "platillo": "Limonada con soda", "cantidad": 2, "nota": null, "estado": "LISTO", "listoEn": "2026-11-06T05:58:00.000Z" }
    ]
  }
]
```

Reglas:

- **La sucursal sale siempre del usuario autenticado**, nunca del request: no hay forma de pedir la cola de otra sucursal.
- Aparecen los pedidos en `RECIBIDO`, `ENVIADO_COCINA` o `EN_PREPARACION` con **al menos un ítem `PENDIENTE`**. Cuando todos los ítems están `LISTO`, el pedido sale de la lista. `items` trae todos los ítems del pedido, también los ya listos, para que cocina vea el pedido completo.
- Un pedido **para llevar sin pago confirmado no aparece**: solo se listan los pedidos para llevar con un pago `CONFIRMADO`.
- `401` sin token o con token inválido; `403` si el rol no tiene acceso o si el usuario no tiene sucursal asignada (por ejemplo, un `GERENTE_GENERAL` sin sucursal).

### Eventos en tiempo real (Socket.IO)

Namespace `/cocina`, autenticado con el mismo access token del HTTP:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/cocina', { auth: { token: accessToken } });

socket.on('connect_error', (err) => console.error(err.message)); // token inválido, rol sin acceso, sin sucursal
socket.on('pedido:nuevo', (pedido) => { /* agregar al final */ });
socket.on('pedido:actualizado', (pedido) => { /* reemplazar por id */ });
socket.on('pedido:retirado', ({ id }) => { /* quitar por id */ });
```

| Evento | Payload | Cuándo |
|---|---|---|
| `pedido:nuevo` | `PedidoCocinaDto` | Un pedido llega a cocina |
| `pedido:actualizado` | `PedidoCocinaDto` | Cambia un pedido que sigue en la cola (por ejemplo, un ítem pasa a `LISTO`) |
| `pedido:retirado` | `{ id: number }` | El pedido ya no tiene ítems `PENDIENTE`, o se canceló |
| `item:listo` | `PedidoCocinaDto` | Se marcó un platillo como listo (H07) |
| `pedido:listo` | `PedidoCocinaDto` | Ese platillo era el último pendiente y el pedido pasó a `LISTO` (H07) |

- La conexión se rechaza en el handshake (el cliente recibe `connect_error`) con las mismas reglas que el endpoint.
- Cada socket se une a la room `sucursal:{sucursalId}` de su usuario y solo recibe los eventos de esa sucursal.
- El token se valida al conectar. Si expira con el socket abierto, la conexión sigue; la siguiente reconexión exige un token vigente.
- `minutosEspera` y `retrasado` vienen calculados al momento del evento. Para que el resaltado avance con el tiempo, el tablero puede recalcularlos con `creadoEn`, o volver a pedir el `GET`.

### Punto de integración para otros módulos

Los eventos los publica `CocinaEventsService`, que exporta `CocinaModule`. Los flujos que cambian pedidos lo llaman después de confirmar su transacción:

```ts
// Pedidos / pagos: el pedido pasó a ENVIADO_COCINA o RECIBIDO
await this.cocinaEvents.pedidoEnviadoACocina(pedido.id);

// Marcar ítem listo o entregado, cancelar o editar el pedido
await this.cocinaEvents.pedidoActualizado(pedido.id);
```

El servicio relee el pedido, decide qué evento corresponde (`nuevo`, `actualizado` o `retirado`) y lo publica en `EventEmitter2`. `CocinaGateway` lo escucha y lo reenvía a la room de la sucursal. Así quien cambia un pedido no depende de Socket.IO.

### Marcar un platillo como listo (H07)

```bash
curl -X PATCH $BASE/cocina/items/301/listo -H "Authorization: Bearer $ACCESS_TOKEN"
```

```jsonc
// 200 OK
{ "itemId": 301, "estado": "LISTO", "listoEn": "12:18", "pedidoEstado": "LISTO" }
```

- Marca el ítem como `LISTO` y guarda `listo_en`. Si ya no queda ningún ítem `PENDIENTE` en el pedido, el pedido pasa a `LISTO`. `pedidoEstado` es el estado del pedido después del cambio.
- `listoEn` es la hora local de El Salvador en `HH:mm`. En `GET /cocina/pedidos` y en los eventos del socket, cada ítem trae `listoEn` en ISO 8601 (o `null` si sigue pendiente), igual que `creadoEn`.
- Después del commit publica `item:listo` y, si el pedido se completó, `pedido:listo`. También publica `pedido:actualizado` o `pedido:retirado`, así el tablero de H06 se actualiza sin cambios.
- La sucursal sale siempre del usuario autenticado.
- Errores: `401` sin sesión; `403` si el rol no es `COCINA` ni `GERENTE`, si el usuario no tiene sucursal o si el platillo es de otra sucursal; `404` si el platillo no existe; `409` si el platillo ya está listo o el pedido no está en cocina (sin pagar, cancelado, entregado).
- **Concurrencia:** la transacción bloquea la fila del ítem y la del pedido (`SELECT … FOR UPDATE`). Si dos cocineros marcan el mismo platillo a la vez, uno recibe `200` y el otro `409`. Si marcan a la vez los dos últimos platillos de un pedido, el pedido igual termina en `LISTO`.

---

## Mesero: entrega de platillos (H08)

### `GET /mesero/items-listos`

```jsonc
// 200 OK — del que se marcó listo primero al último
[{ "itemId": 301, "pedidoId": 120, "mesa": 7, "platillo": "Pupusa revuelta", "cantidad": 3, "listoEn": "12:18" }]
```

- Solo ítems `LISTO` de pedidos de mesa (no para llevar ni cancelados) de la sucursal del usuario autenticado. Los entregados ya no aparecen.
- `mesa` es el número de mesa: el front agrupa por ese campo. `listoEn` es la hora local de El Salvador en `HH:mm`.
- Errores: `401` sin sesión; `403` si el rol no es `MESERO` o el usuario no tiene sucursal.

### `PATCH /mesero/items/:itemId/entregado`

```jsonc
// 200 OK
{ "itemId": 301, "estado": "ENTREGADO", "entregadoEn": "12:25", "pedidoEstado": "ENTREGADO" }
```

- Marca el ítem como `ENTREGADO` y guarda `entregado_en` y `entregado_por_id` (el mesero autenticado). Si todos los ítems del pedido quedan `ENTREGADO`, el pedido pasa a `ENTREGADO` (queda cerrado y la mesa se libera).
- Al completar el pedido, después del commit, publica `pedido:entregado` (`PedidoCocinaDto`) en el namespace `/cocina`.
- Errores: `401` sin sesión; `403` si el rol no es `MESERO`, si el usuario no tiene sucursal o si el platillo es de otra sucursal; `404` si el platillo no existe; `409` si ya fue entregado o el pedido está cancelado; `422` si todavía no está listo.
- **Concurrencia:** igual que H07, bloquea la fila del ítem y la del pedido (`SELECT … FOR UPDATE`). Si dos meseros entregan el mismo platillo a la vez, uno recibe `200` y el otro `409`.

---

## Inventario de insumos (H14)

Solo para `GERENTE`. La sucursal siempre sale del usuario autenticado, nunca de un parámetro: si el body trae `sucursalId`, la validación responde `400`.

### `GET /inventario/insumos?q=queso`

```jsonc
// 200 OK — ordenados por nombre
[{ "id": 5, "nombre": "Queso con loroco", "unidad": "lb", "cantidad": 12.5, "minimo": 10, "estado": "NORMAL" }]
```

- `q` filtra por parte del nombre sin distinguir mayúsculas.
- `estado` se calcula, no se guarda: `BAJO` si `cantidad <= minimo`, si no `NORMAL`.
- Errores: `401` sin sesión; `403` si el rol no es `GERENTE` o el usuario no tiene sucursal.

### `POST /inventario/insumos`

```jsonc
// Body
{ "nombre": "Masa de maíz", "unidad": "lb", "minimo": 20 }
// 201 Created
{ "id": 9, "nombre": "Masa de maíz", "unidad": "lb", "cantidad": 0, "minimo": 20, "estado": "BAJO" }
```

- Unidades permitidas: `lb`, `kg`, `l`, `unidad`. Se guardan en el enum `unidad_insumo`.
- Errores: `400` nombre o unidad vacíos, unidad no permitida o mínimo negativo; `401`; `403`; `409` si ya existe un insumo con ese nombre en la sucursal (sin distinguir mayúsculas, índice `insumo_sucursal_nombre_ci`).

### `POST /inventario/insumos/:id/movimientos`

```jsonc
// Body
{ "tipo": "SALIDA", "cantidad": 3, "motivo": "Uso en cocina" }
// 201 Created
{ "movimientoId": 88, "cantidadAnterior": 12.5, "cantidadActual": 9.5 }
```

- Guarda el movimiento (usuario, fecha y hora, motivo, cantidad anterior y actual) y la nueva cantidad del insumo en una sola transacción.
- En la misma transacción evalúa las alertas del insumo (ver H15).
- Errores: `400` cantidad menor o igual a 0, tipo inválido o motivo vacío; `401`; `403` si el rol no es `GERENTE` o el insumo es de otra sucursal; `404` si el insumo no existe; `422` si la salida supera la existencia (la cantidad no cambia) o si la entrada supera el máximo de `DECIMAL(12, 3)`.
- **Concurrencia:** la transacción bloquea la fila del insumo (`SELECT … FOR UPDATE`) antes de leer la cantidad. Si dos salidas simultáneas juntas superan la existencia, una recibe `201` y la otra `422`.

### `GET /inventario/insumos/:id/movimientos?pagina=1`

```jsonc
// 200 OK — 10 por página, del más reciente al más antiguo
{
  "pagina": 1, "totalPaginas": 3, "total": 23,
  "datos": [{ "id": 88, "fecha": "2026-11-17", "hora": "14:05", "usuario": "Ana López", "tipo": "SALIDA", "cantidad": 3, "motivo": "Uso en cocina" }]
}
```

- `fecha` y `hora` en hora local de El Salvador. `usuario` es el nombre de quien registró el movimiento (su email si no tiene nombre).
- Errores: `400` página inválida; `401`; `403` si el rol no es `GERENTE` o el insumo es de otra sucursal; `404` si el insumo no existe.

---

## Alertas de inventario (H15)

### Generación y cierre automático

Cada movimiento de `POST /inventario/insumos/:id/movimientos` llama a `EvaluadorAlertasInventario.evaluar` dentro de su transacción, con la fila del insumo bloqueada:

| Después del movimiento | Sin alerta abierta | Con alerta `ACTIVA` o `VISTA` |
|---|---|---|
| `cantidad <= minimo` | Crea una alerta `ACTIVA` con cantidad, mínimo y sucursal | No hace nada |
| `cantidad > minimo` | No hace nada | La pasa a `RESUELTA` y guarda `resuelta_en` |

- Estados: `ACTIVA → VISTA → RESUELTA`, o `ACTIVA → RESUELTA` directo.
- El índice único parcial `alerta_insumo_activa_unica` impide dos alertas sin resolver para el mismo insumo. La alerta se inserta con `ON CONFLICT … DO NOTHING`: si el índice la descarta, el movimiento sigue (una violación de unicidad atrapada dejaría abortada la transacción en PostgreSQL).
- Al **crear** una alerta, después del commit, se avisa a los gerentes de la sucursal con `NotificacionesService.notificar` (BE-27.1), con correo y referencia `ALERTA_INSUMO`. Si el aviso falla, se registra en el log; la alerta y el movimiento ya quedaron guardados.

### `GET /inventario/alertas`

```jsonc
// 200 OK — de la más reciente a la más antigua
[{ "id": 9, "insumoId": 5, "insumo": "Masa de maíz", "cantidad": 18, "minimo": 20, "unidad": "lb", "estado": "ACTIVA", "creadaEn": "2026-11-18T14:05:00.000Z" }]
```

- Solo alertas `ACTIVA` y `VISTA` de la sucursal del usuario autenticado. `cantidad` y `minimo` son los del momento en que se creó la alerta.
- Errores: `401` sin sesión; `403` si el rol no es `GERENTE` o el usuario no tiene sucursal.

### `PATCH /inventario/alertas/:id/vista`

- Pasa la alerta de `ACTIVA` a `VISTA` y guarda `vista_en`. Si ya estaba `VISTA`, responde `200` sin cambios. Devuelve la alerta con el mismo formato del listado; sigue apareciendo en el listado hasta que se resuelve.
- Errores: `401`; `403` si el rol no es `GERENTE` o la alerta es de otra sucursal; `404` si no existe; `409` si ya está resuelta.

---

## Dashboard de ventas (H28)

Para `GERENTE_GENERAL` y `GERENTE`: el controlador usa `@Roles(Rol.GERENTE_GENERAL, Rol.GERENTE)` y el `RolesGuard` global responde `403` a cualquier otro rol.

- El gerente general consulta todas las sucursales o la que indique en `sucursalId`.
- El gerente de sucursal solo ve la suya: `DashboardService.limitarAlcance` fija `sucursalId` con la sucursal del usuario. Responde `403` si pide otra sucursal o si no tiene sucursal asignada.

Las tres rutas reciben el mismo periodo: `desde` y `hasta` (`YYYY-MM-DD`, días completos en hora de El Salvador) y `sucursalId` opcional. Un rango con `hasta` anterior a `desde` responde `400` y una sucursal inexistente, `404`.

**Qué cuenta como venta.** Las consultas parten de la vista `venta_confirmada`: subtotal − descuentos, sin IVA ni propina, solo pedidos con un pago `CONFIRMADO`. Además se excluye cualquier pedido con un pago `REEMBOLSADO`. El periodo y las franjas horarias usan la fecha de confirmación del pago.

### `GET /dashboard/ventas`

```bash
curl "$BASE/dashboard/ventas?desde=2026-11-01&hasta=2026-11-30" -H "Authorization: Bearer $ACCESS_TOKEN"
```

```jsonc
{
  "desde": "2026-11-01",
  "hasta": "2026-11-30",
  "sucursales": [
    { "sucursalId": 1, "nombre": "Centro", "ventas": 8120, "pedidos": 640, "ticketPromedio": 12.69 }
  ],
  "totalGeneral": { "ventas": 8120, "pedidos": 640, "ticketPromedio": 12.69 },
  "platillos": [{ "platilloId": 4, "nombre": "Hamburguesa", "cantidad": 120, "monto": 1078.8 }],
  "horariosPico": [{ "sucursalId": 1, "nombre": "Centro", "franjas": [{ "hora": 12, "ventas": 1543.25 }] }]
}
```

- `ticketPromedio` = ventas ÷ pedidos redondeado a dos decimales; `0` si no hubo pedidos. `totalGeneral.ticketPromedio` es ventas totales ÷ pedidos totales. Se calculan solo en el backend para que el dashboard (H28) y el comparativo (H29) usen el mismo valor.
- `sucursales` incluye todas las sucursales de la selección, también las que no vendieron.
- `platillos` viene de mayor a menor cantidad; en empate, primero el de mayor monto.
- `diaSemana` opcional (`0` = domingo) filtra solo `horariosPico`.

### `GET /dashboard/ventas/detalle`

Una fila por pedido que cuenta como venta, de la más reciente a la más antigua. Acepta `pagina` (por defecto `1`) y `porPagina` (por defecto `20`, máximo `100`) y responde `{ items, total, pagina, porPagina }`.

### `GET /dashboard/ventas/exportar`

Descarga `ventas-por-sucursal_{desde}_{hasta}.csv` con la misma tabla que muestra el dashboard: una fila por sucursal (mayor venta primero) y al final `Total general`.

```csv
Sucursal,Ventas,Pedidos,Ticket promedio
Centro,8120.00,640,12.69
Escalón,4310.25,330,13.06
Total general,12430.25,970,12.81
```

---

## Paginación común

Todo listado paginado usa lo mismo, en `src/common/paginacion` (`@Common/paginacion`):

- `PaginacionQueryDto`: `?pagina=N`, entero de 1 a 1000, por defecto 1. Si no cumple responde 400.
- `saltoDePagina(pagina, porPagina)`: cuántos registros saltar (`skip` de Prisma).
- `metaPaginacion(total, pagina, porPagina)`: `{ pagina, totalPaginas, total }`.
- `paginar(datos, total, pagina, porPagina)`: lo mismo más `datos`.

```ts
@Get()
listar(@Query() { pagina }: PaginacionQueryDto) {
  return this.service.listar(pagina);
}

// En el service
const [datos, total] = await Promise.all([
  this.repo.findMany({ skip: saltoDePagina(pagina, 10), take: 10 }),
  this.repo.count(),
]);
return paginar(datos, total, pagina, 10);
```

Si el query necesita más filtros, extiende el DTO: `class MiQueryDto extends PaginacionQueryDto { ... }`. En el front está el componente `Paginacion` (`components/ui/paginacion.tsx`).

---

## Arquitectura por capas

Cada módulo se organiza en carpetas por responsabilidad, y **cada carpeta expone un barrel `index.ts`**. El flujo de una request es siempre el mismo:

```
HTTP  →  controllers/  →  services/  →  repositories/  →  Prisma  →  PostgreSQL
            (HTTP)         (negocio)      (acceso a datos)
```

| Capa | Responsabilidad | No debe |
|---|---|---|
| `controllers/` | Traducir HTTP a llamadas de servicio: rutas, códigos de estado, Swagger | Contener lógica de negocio ni tocar Prisma |
| `services/` | Lógica de negocio y reglas del dominio | Conocer Prisma ni sus códigos de error |
| `repositories/` | **Todo** el acceso a datos. Es el único lugar que inyecta `PrismaService` | Lanzar excepciones HTTP |
| `dto/` | Forma y validación de lo que entra y sale | — |
| `errors/` | Errores de dominio que cruzan de repositorio a servicio | — |

### Por qué los repositorios

Antes los servicios inyectaban `PrismaService` directamente. Moverlo a repositorios da tres cosas concretas:

1. **Un solo lugar por tabla.** Toda query sobre `users` vive en [user.repository.ts](src/users/repositories/user.repository.ts); toda query sobre `refresh_tokens`, en [refresh-token.repository.ts](src/auth/repositories/refresh-token.repository.ts). Buscar "dónde se actualiza esto" deja de ser un grep por todo el proyecto.
2. **Servicios testeables sin base de datos.** Como `UsersService` depende de `UserRepository` y no de Prisma, un test unitario le pasa un doble y listo.
3. **Métodos reutilizables.** Los repositorios se exportan desde su módulo, así que otro módulo puede reutilizar el acceso a datos sin pasar por la lógica del servicio.

### Errores de dominio en lugar de códigos del ORM

El repositorio traduce el código `P2002` de Prisma (violación de unicidad) a un `EmailAlreadyTakenError`, y el servicio lo convierte en un `409 Conflict`:

```ts
// repositories/user.repository.ts — sabe de Prisma, no sabe de HTTP
if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
  throw new EmailAlreadyTakenError(email);
}

// services/users.service.ts — sabe de HTTP, no sabe de Prisma
if (error instanceof EmailAlreadyTakenError) {
  throw new ConflictException('El email ya está registrado.');
}
```

Así ninguna capa filtra sus detalles hacia la otra: si mañana se cambia de ORM, solo se toca el repositorio.

---

## Path aliases

Cada módulo tiene un alias `@NombreModulo`, y como cada carpeta tiene su barrel, el import apunta directo a la capa:

```ts
import { AuthService, TokenService } from '@Auth/services';
import { UserRepository }            from '@Users/repositories';
import { CreateUserDto }             from '@Users/dto';
import { Public, CurrentUser }       from '@Auth/decorators';
import { IsNormalizedEmail }        from '@Common/decorators';
import type { EnvConfig }            from '@Config';
import type { User }                 from '@PrismaClient';
```

Definidos en [tsconfig.json](tsconfig.json):

| Alias | Resuelve a |
|---|---|
| `@Auth`, `@Auth/*` | `src/auth/index.ts`, `src/auth/*/index.ts` |
| `@Users`, `@Users/*` | `src/users/…` |
| `@Health`, `@Health/*` | `src/health/…` |
| `@Prisma`, `@Prisma/*` | `src/prisma/…` |
| `@Cocina`, `@Cocina/*` | `src/cocina/…` |
| `@Mesero`, `@Mesero/*` | `src/mesero/…` |
| `@Inventario`, `@Inventario/*` | `src/inventario/…` |
| `@Resenas`, `@Resenas/*` | `src/resenas/…` |
| `@Common/*` | `src/common/*/index.ts` |
| `@Config` | `src/config/index.ts` |
| `@PrismaClient` | Cliente generado de Prisma |

### Dos detalles que hacen que esto funcione

**El comodín termina en `/index.ts`**, no en `/*`:

```jsonc
"@Auth/*": ["./src/auth/*/index.ts"]   // ✅
"@Auth/*": ["./src/auth/*"]            // ❌ TS2307
```

Con `moduleResolution: nodenext` TypeScript **no** resuelve un directorio a su `index`, así que la segunda forma no encuentra el módulo. Apuntar explícitamente al barrel lo resuelve, y además deja una sola entrada por módulo en el tsconfig.

**El build reescribe los alias con `tsc-alias`.** `tsc` emite `from '@Auth/services'` tal cual, y Node ESM falla con `ERR_INVALID_MODULE_SPECIFIER` porque no es un nombre de paquete válido. Por eso el build es:

```
nest build && tsc-alias -p tsconfig.build.json
```

`tsc-alias` reescribe el JS emitido a rutas relativas reales (`./auth/services/index.js`). En watch mode el `start:dev` corre ambos procesos con `concurrently`. Vitest resuelve los alias por su cuenta con `vite-tsconfig-paths`, así que los tests no necesitan el paso extra.

> Si agregás un módulo nuevo, sumá su par de entradas al `paths` del tsconfig. Si agregás una carpeta dentro de un módulo existente, con crear su `index.ts` alcanza: el comodín ya la cubre.

---

## Estructura del proyecto

```
.
├── docker-compose.yml            # Postgres + API para desarrollo local
├── Dockerfile                    # Imagen multi-stage de la API
├── prisma.config.ts              # Configuración del CLI de Prisma
├── prisma/
│   ├── schema.prisma             # Modelos del sistema de restaurantes
│   ├── migrations/               # Migraciones versionadas
│   └── seed.ts                   # Sucursales, menú, usuarios por rol y pedidos de ejemplo
└── src/
    ├── main.ts                   # Bootstrap: prefijo, validación, Swagger
    ├── app.module.ts             # Módulo raíz y guard global
    ├── common/
    │   └── decorators/           # IsNormalizedEmail (validación compartida)
    ├── config/
    │   ├── env.validation.ts     # Validación de variables de entorno
    │   └── index.ts
    ├── prisma/
    │   ├── services/             # PrismaService (cliente + driver adapter)
    │   ├── prisma.module.ts      # Módulo global
    │   └── index.ts
    ├── health/
    │   ├── controllers/          # GET /
    │   ├── services/
    │   ├── health.module.ts
    │   └── index.ts
    ├── users/
    │   ├── controllers/          # POST /users
    │   ├── services/             # Lógica de negocio, hasheo bcrypt
    │   ├── repositories/         # UserRepository: acceso a la tabla users
    │   ├── errors/               # EmailAlreadyTakenError
    │   ├── dto/
    │   ├── users.module.ts
    │   └── index.ts
    ├── auth/
    │   ├── controllers/          # login, refresh, logout, me
    │   ├── services/             # AuthService y TokenService
    │   ├── repositories/         # RefreshTokenRepository
    │   ├── guards/               # JwtAuthGuard y RolesGuard
    │   ├── decorators/           # @Public(), @CurrentUser() y @Roles()
    │   ├── types/                # AccessTokenPayload, TokenPair
    │   ├── dto/
    │   ├── auth.module.ts
    │   └── index.ts
    ├── cocina/
    │   ├── controllers/          # GET /cocina/pedidos
    │   ├── gateways/             # CocinaGateway (Socket.IO, namespace /cocina)
    │   ├── services/             # CocinaService (reglas) y CocinaEventsService (integración)
    │   ├── repositories/         # PedidoCocinaRepository
    │   ├── events/               # Eventos internos y eventos de Socket.IO
    │   ├── constants/            # Roles, estados en cocina, namespace y rooms
    │   ├── dto/                  # PedidoCocinaDto
    │   ├── cocina.module.ts
    │   └── index.ts
    ├── mesero/
    │   ├── controllers/          # GET /mesero/items-listos, PATCH /mesero/items/:itemId/entregado
    │   ├── services/             # EntregasService
    │   ├── repositories/         # EntregasRepository (bloqueo de fila al entregar)
    │   ├── errors/               # ItemYaEntregadoError, ItemNoListoError, PedidoCanceladoError
    │   ├── dto/
    │   ├── mesero.module.ts
    │   └── index.ts
    ├── inventario/
    │   ├── controllers/          # Insumos, entradas, salidas e historial; alertas (H15)
    │   ├── services/             # InventarioService, AlertasService y EvaluadorAlertasInventario
    │   ├── repositories/         # InsumosRepository (bloqueo de fila) y AlertasInsumoRepository
    │   ├── errors/               # InsumoDuplicadoError, ExistenciaInsuficienteError, AlertaResueltaError, …
    │   ├── utils/                # Unidades, estado BAJO/NORMAL y límites
    │   ├── dto/
    │   ├── inventario.module.ts
    │   └── index.ts
    └── generated/prisma/         # Cliente de Prisma (ignorado en git)
```

Cada carpeta de capa incluye un `index.ts` que reexporta sus elementos, de modo que el resto del proyecto importe del barrel y nunca de un archivo suelto.

---

## Scripts disponibles

| Script | Descripción |
|---|---|
| `start` | Compila y arranca la API |
| `start:dev` | Arranca en modo watch (compilador + reescritura de alias) |
| `start:prod` | Arranca desde `dist/` ya compilado |
| `build` | Compila a `dist/` y reescribe los path aliases |
| `lint` | Corre oxlint con chequeos type-aware |
| `format` | Formatea con Prettier |
| `test` | Tests unitarios |
| `test:e2e` | Todos los tests end-to-end contra el Postgres local (`LOCAL_DATABASE_URL` y las bases temporales de H10, H11 y H17) |
| `test:h10` / `test:h11` / `test:h17` | Solo la prueba de esa historia, en su base temporal local |
| `test:cov` | Tests con reporte de cobertura |
| `prisma:generate` | Regenera el cliente de Prisma |
| `prisma:migrate` | Crea y aplica una migración en la base local (`LOCAL_DATABASE_URL`) |
| `prisma:deploy` | Aplica migraciones pendientes (producción) |
| `prisma:studio` | Abre Prisma Studio |
| `db:seed` | Carga los datos de prueba |
| `db:reset` | Resetea la base local (`LOCAL_DATABASE_URL`) y vuelve a migrar |
| `db:verificar` | Muestra a qué base se conecta la API, si va cifrada y si el certificado se validó |
