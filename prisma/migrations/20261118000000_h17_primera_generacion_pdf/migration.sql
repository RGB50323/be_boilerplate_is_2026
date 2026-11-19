BEGIN;

-- Los comprobantes nuevos comienzan en NULL hasta que se genera su PDF ORIGINAL.
ALTER TABLE "comprobante" ADD COLUMN "primera_generacion_pdf_en" TIMESTAMP(3);

-- Por precaución, los comprobantes históricos se tratan como ya generados y
-- se descargan como COPIA. La fecha de corte no acredita una descarga previa.
UPDATE "comprobante"
SET "primera_generacion_pdf_en" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC';

COMMIT;
