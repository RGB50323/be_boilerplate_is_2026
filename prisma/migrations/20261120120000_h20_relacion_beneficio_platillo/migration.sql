BEGIN;

ALTER TABLE "beneficio" ADD COLUMN "platillo_id" INTEGER;
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_platillo_id_fkey"
  FOREIGN KEY ("platillo_id") REFERENCES "platillo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "canje" ADD COLUMN "nombre_beneficio" VARCHAR(120);

UPDATE "canje" AS c
SET "nombre_beneficio" = b."nombre"
FROM "beneficio" AS b
WHERE c."beneficio_id" = b."id"
  AND c."nombre_beneficio" IS NULL
  AND btrim(b."nombre") <> '';

COMMIT;
