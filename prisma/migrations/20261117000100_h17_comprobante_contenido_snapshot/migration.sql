-- Guarda una copia independiente del ticket para generar documentos históricos.
-- Los comprobantes existentes quedan con NULL y permiten consultar sus metadatos.
ALTER TABLE "comprobante" ADD COLUMN "contenido_snapshot" JSONB;
