# Instalación local

## Requisitos

- Docker y docker-compose
- Node.js 24 (solo si se corre fuera de Docker, o para el frontend)
- Git

## Backend

1. Clonar el repositorio del backend.
2. Copiar el archivo de variables: `cp .env.example .env` y completar los valores (al menos `JWT_SECRET`).
3. Pedir la contraseña de la base al administrador del proyecto de Supabase (nunca se sube al repositorio). En Supabase, **Connect**, copiar al `.env` el *Transaction pooler* en `DATABASE_URL` (agregando `?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt`) y el *Session pooler* en `DIRECT_URL`. El certificado `certs/supabase-ca.crt` ya está en el repositorio.
4. `npm ci` y `npm run start:dev`. La base compartida ya tiene las migraciones y los datos semilla: no hay que migrar ni correr el seed.
5. Comprobar la conexión con `npm run db:verificar`: debe decir `Cifrada (TLS): sí` y `Certificado: validado`.
6. Abrir `http://localhost:3000/api/docs` (Swagger).

Para trabajar sin Supabase: `docker compose up -d` levanta Postgres y la API, y aplica las migraciones al arrancar. Esa API usa **siempre la base local** del contenedor, aunque el `.env` tenga la URL de Supabase.

## Frontend

1. Clonar el repositorio del frontend.
2. Copiar `.env.example` a `.env.local` y poner `API_URL` apuntando al backend con el prefijo `/api/v1` (por ejemplo `http://localhost:3000/api/v1`) y `SOCKET_URL` con la URL base del backend.
3. `npm install`
4. `npm run dev` y abrir `http://localhost:3000` (si el puerto lo usa el backend, Next.js propone otro).

## Variables de entorno

### Backend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Conexión de la API y el seed: transaction pooler de Supabase (puerto 6543) con validación del certificado | `postgresql://postgres.[ref]:[contraseña]@[host].pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt` |
| `DIRECT_URL` | Conexión del CLI de Prisma (`migrate deploy`, `migrate status`): session pooler de Supabase (puerto 5432) | `postgresql://postgres.[ref]:[contraseña]@[host].pooler.supabase.com:5432/postgres` |
| `LOCAL_DATABASE_URL` | Postgres local de Docker. Obligatoria para lo que borra datos (`prisma:migrate`, `db:reset`, `test:e2e`); tiene que ser `localhost`, `127.0.0.1` o `::1` | `postgresql://postgres:postgres@localhost:5432/si_be_boilerplate?schema=public` |
| `JWT_SECRET` | Secreto con el que se firman los access tokens | cadena larga y aleatoria |
| `JWT_EXPIRES_IN` | Vigencia del access token | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Vigencia del refresh token | `7` |
| `BCRYPT_SALT_ROUNDS` | Costo del hash de contraseñas | `12` |
| `COCINA_MINUTOS_RETRASO` | Minutos para marcar un pedido como retrasado en cocina | `15` |
| `UPLOADS_DIR` | Carpeta de las imágenes de platillos cuando no se usa Supabase Storage (por defecto `./uploads`) | `/app/uploads` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET_PLATILLOS` | Opcionales. Si se definen, las imágenes de platillos se guardan en Supabase Storage; si no, en `UPLOADS_DIR`. Hay que definir las dos primeras juntas | `https://<proyecto>.supabase.co`, clave secreta, `platillos` |
| `PORT` | Puerto de la API | `3000` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Usadas por docker-compose para crear la base | `postgres` |

### Frontend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL base de la API, con `/api/v1` | `http://localhost:3000/api/v1` |
| `SOCKET_URL` | URL base del backend para el tablero de cocina en tiempo real | `http://localhost:3000` |

## Datos semilla

`prisma/seed.ts` crea dos sucursales (Centro y Escalón), sus horarios, mesas, categorías, platillos con precio y disponibilidad por sucursal, pedidos de ejemplo y un usuario por rol. La contraseña de todos los usuarios semilla se imprime al ejecutar el script y está definida en `prisma/seed.ts`.

| Rol | Correo |
|---|---|
| Cliente | demo@example.com |
| Mesero | mesero@example.com |
| Cocina | cocina@example.com |
| Gerente | gerente@example.com |
| Gerente general | gerente.general@example.com |

El seed se corre **una sola vez** sobre la base compartida (`npm run db:seed`) y solo se vuelve a correr cuando cambia, avisando al equipo. No duplica datos, pero sí restaura los datos de demostración que otros pueden estar usando.

## Pruebas automatizadas

```
npm test              # pruebas unitarias (backend y frontend), no usan base de datos
npm run build         # algunas e2e del backend importan desde dist/
npm run test:e2e      # todas las pruebas de integración del backend
npm run lint
```

`test:e2e` necesita el Postgres de Docker encendido (`docker compose up -d postgres`) y `LOCAL_DATABASE_URL` en el `.env`; si falta o no es local, no arranca. Nunca corre contra Supabase. Las pruebas de H10, H11 y H17 usan cada una su base temporal (`h10_test`, `h11_test`, `h17_test`), que se crea y se migra sola en el mismo servidor local. Para correr solo una: `npm run test:h10`, `test:h11` o `test:h17`.

Si la base local está atrasada (error de una columna que no existe), `npm run prisma:migrate` la actualiza; siempre va a la base local.

En el backend, las pruebas unitarias están junto al código como `*.spec.ts` y las de integración en `test/*.e2e-spec.ts`. En el frontend están en `test/*.test.ts(x)`.
