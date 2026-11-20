BEGIN;

CREATE FUNCTION "beneficio_proteger_deshabilitado_en"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."deshabilitado_en" IS NOT NULL
     AND NEW."deshabilitado_en" IS DISTINCT FROM OLD."deshabilitado_en" THEN
    RAISE EXCEPTION 'La fecha de deshabilitación de un beneficio es definitiva'
      USING ERRCODE = '23514', CONSTRAINT = 'beneficio_deshabilitado_en_irreversible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "beneficio_deshabilitado_en_irreversible"
BEFORE UPDATE ON "beneficio"
FOR EACH ROW EXECUTE FUNCTION "beneficio_proteger_deshabilitado_en"();

COMMIT;
