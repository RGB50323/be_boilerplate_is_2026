ALTER TYPE "estado_pedido" ADD VALUE 'CERRADO';
ALTER TABLE "pago" ADD COLUMN "detalle_pago" JSONB;
ALTER TABLE "comprobante" ADD COLUMN "detalle_pago" JSONB;
