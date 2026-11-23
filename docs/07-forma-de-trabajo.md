# Forma de trabajo

**Tablero:** https://rafagdelb.atlassian.net/jira/software/projects/LB/boards/37

## Ramas (Git Flow)

- `main`: código en producción. Recibe cambios desde `release/*` y `hotfix/*`.
- `development`: rama de integración.
- `feature/<ID>-<descripcion>`: una rama por historia.
- `bugfix/<ID>-<descripcion>`: correcciones de defectos encontrados en las pruebas.
- `release/<version>` y `hotfix/<descripcion>`: publicación y correcciones de producción.

## Commits

Formato `<tipo>(<ID>): <descripción>`, por ejemplo `feat(H5): valida el traslape de reservas`.
Tipos que usamos: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`.

## Pull requests

- El título lleva el ID de la historia y su nombre.
- La descripción resume el cambio, enlaza la card del tablero y lista las pruebas realizadas.
- Otro integrante del equipo lo revisa y lo aprueba; solo entonces se fusiona a `development`.
- Cada historia terminada pasa a la columna **Hecho** del tablero con el enlace a su PR.

## Base de datos compartida

- Todos trabajan sobre la misma base de Supabase. Los datos de prueba son de todos: los escenarios que borran datos o los dejan inconsistentes se prueban en la base local de Docker.
- Las migraciones se crean en la base local (`npm run prisma:migrate -- --name ...`) y llegan a Supabase solo cuando el PR entra a `development`: quien hace el merge corre `npm run prisma:deploy` y avisa al equipo.
- Para probar una rama con columnas nuevas antes del merge, se apunta temporalmente `DATABASE_URL` a la base local.
- Después de cada `git pull`, `npm ci`, para tener las dependencias y el cliente de Prisma al día.
- El seed se corre solo cuando cambia y avisando.
- La contraseña de Supabase se comparte en privado, nunca en el repositorio ni en el grupo.
