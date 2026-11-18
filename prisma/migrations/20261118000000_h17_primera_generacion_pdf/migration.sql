BEGIN;

ALTER TABLE "comprobante" ADD COLUMN "primera_generacion_pdf_en" TIMESTAMP(3);

-- Los comprobantes existentes pueden haber sido descargados sin registro.
-- La fecha del corte reserva el uso de COPIA para esos comprobantes.
UPDATE "comprobante"
SET "primera_generacion_pdf_en" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC';

COMMIT;
