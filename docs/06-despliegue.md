# Despliegue

## Dónde está desplegado

| Componente | Plataforma | URL | Rama |
|---|---|---|---|
| Frontend | Heroku (app Node.js) | [https://los-burle-web-884b4ca168fd.herokuapp.com](https://los-burle-web-884b4ca168fd.herokuapp.com) | main |
| Backend | Heroku (contenedor Docker) | [https://los-burle-api-01b8379425c8.herokuapp.com](https://los-burle-api-01b8379425c8.herokuapp.com) (Swagger en [/api/docs](https://los-burle-api-01b8379425c8.herokuapp.com/api/docs)) | main |
| Base de datos | Supabase (PostgreSQL 17) | (privada) | |

El despliegue en Heroku lo configuró Luis Merino ([PR #37](https://github.com/RGB50323/be_boilerplate_is_2026/pull/37)): `heroku.yml` para construir la imagen del backend, la fase *release* con las migraciones, el certificado CA de Supabase en la imagen y las variables de entorno de las dos apps.

## Cómo se publica una nueva versión

El despliegue es **manual**: no hay despliegue automático configurado al fusionar. Lo que está desplegado es siempre el código de `main` (versión 1.0.0).

1. Cada historia se trabaja en su rama `feature/<ID>-<descripcion>` y entra a `development` por pull request aprobado. Cuando las historias están en `development`, se crea `release/<version>`, se fusiona a `main` con un PR aprobado y solo se despliega `main`, porque cada despliegue aplica a Supabase las migraciones de la rama desplegada.
2. Con acceso a la app en Heroku: `heroku login` y `heroku git:remote -a los-burle-api`.
3. Desde `main` actualizada: `git push heroku main`.
4. **Backend:** Heroku construye la imagen con el `Dockerfile` según `heroku.yml`. Antes de publicarla corre la fase *release* con `npx prisma migrate deploy`, que aplica las migraciones pendientes a Supabase; si falla, la versión nueva no se publica. Luego arranca la API con `node dist/main.js`.
5. Revisar el resultado de las migraciones con `heroku releases:output -a los-burle-api` y el arranque con `heroku logs --tail -a los-burle-api`. Comprobar que `/api/v1` responde `Hello World!` y que abre `/api/docs`.
   Si el arranque falla con un error de SSL o de certificado, revisar que `certs/supabase-ca.crt` esté en el repositorio (el `Dockerfile` lo copia a la imagen) y que `DATABASE_URL` termine en `?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt`.
6. **Frontend:** Heroku instala las dependencias, corre `npm run build` (`next build`) y levanta la app con `npm start` (`next start`).
7. Después de un merge con migraciones, el equipo hace `git pull` y `npm ci` para que su cliente de Prisma conozca las columnas nuevas.

## Variables de entorno en producción

Todas se configuran en el panel de Heroku de cada app, en **Settings › Config Vars**.

| Variable | Dónde se configura |
|---|---|
| `DATABASE_URL` (transaction pooler de Supabase, puerto 6543, con `sslmode=verify-full&sslrootcert=certs/supabase-ca.crt`) | App del backend |
| `DIRECT_URL` (session pooler de Supabase, puerto 5432, para `prisma migrate deploy`) | App del backend |
| `JWT_SECRET` | App del backend |
| `JWT_EXPIRES_IN` | App del backend |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | App del backend |
| `BCRYPT_SALT_ROUNDS` | App del backend |
| `COCINA_MINUTOS_RETRASO` | App del backend |
| `FRONTEND_URL` (orígenes permitidos por CORS) | App del backend |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET_PLATILLOS` (imágenes de platillos en Supabase Storage) | App del backend |
| `NODE_ENV` | App del backend y del frontend |
| `PORT` | La asigna Heroku automáticamente |
| `API_URL` (URL del backend con `/api/v1`) | App del frontend |
| `SOCKET_URL` (URL base del backend, para el tiempo real de cocina) | App del frontend |
