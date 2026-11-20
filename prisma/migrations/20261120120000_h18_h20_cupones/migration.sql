BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM beneficio
    WHERE vigente_desde IS NULL OR vigente_hasta IS NULL
       OR vigente_hasta <= vigente_desde
  ) THEN
    RAISE EXCEPTION 'Revise las fechas de vigencia de los beneficios existentes antes de migrar';
  END IF;
END $$;

ALTER TABLE beneficio
  ALTER COLUMN vigente_desde SET NOT NULL,
  ALTER COLUMN vigente_hasta SET NOT NULL,
  DROP CONSTRAINT beneficio_vigencia_chk,
  ADD CONSTRAINT beneficio_vigencia_chk CHECK (vigente_hasta > vigente_desde);

ALTER TABLE canje ADD COLUMN utilizado_en TIMESTAMP(3);

COMMIT;
