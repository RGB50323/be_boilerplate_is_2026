BEGIN;

LOCK TABLE "beneficio", "canje" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  filas_incompatibles bigint;
BEGIN
  SELECT count(*) INTO filas_incompatibles
  FROM "beneficio"
  WHERE "vigente_desde" IS NULL OR "vigente_hasta" IS NULL
     OR "vigente_hasta" <= "vigente_desde";

  IF filas_incompatibles > 0 THEN
    RAISE EXCEPTION 'H20: % beneficios tienen vigencia incompleta o sin duración', filas_incompatibles
      USING HINT = 'Revisar las vigencias con la información original antes de reintentar.';
  END IF;
END $$;

-- Incluye canjes que se hayan registrado tras la primera migración.
UPDATE "canje" AS c
SET "nombre_beneficio" = b."nombre"
FROM "beneficio" AS b
WHERE c."beneficio_id" = b."id"
  AND c."nombre_beneficio" IS NULL
  AND btrim(b."nombre") <> '';

-- Instante de conservación de la baja cuando se desconoce la fecha original.
UPDATE "beneficio"
SET "deshabilitado_en" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE NOT "activo" AND "deshabilitado_en" IS NULL;

ALTER TABLE "beneficio"
  DROP CONSTRAINT "beneficio_vigencia_chk",
  ALTER COLUMN "vigente_desde" SET NOT NULL,
  ALTER COLUMN "vigente_hasta" SET NOT NULL,
  ADD CONSTRAINT "beneficio_vigencia_chk" CHECK ("vigente_desde" < "vigente_hasta"),
  DROP COLUMN "nombre",
  DROP COLUMN "descripcion",
  DROP COLUMN "activo";

COMMIT;
