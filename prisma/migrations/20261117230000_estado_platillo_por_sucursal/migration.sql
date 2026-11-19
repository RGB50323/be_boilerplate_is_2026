ALTER TABLE "platillo_sucursal"
ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

UPDATE "platillo_sucursal" AS ps
SET "activo" = p."activo"
FROM "platillo" AS p
WHERE p."id" = ps."platillo_id";