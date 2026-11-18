-- Conserva el ticket validado junto con los nuevos pagos pendientes.
-- Los pagos históricos quedan con NULL porque su ticket original no se registró.
ALTER TABLE "pago" ADD COLUMN "ticket_snapshot" JSONB;
