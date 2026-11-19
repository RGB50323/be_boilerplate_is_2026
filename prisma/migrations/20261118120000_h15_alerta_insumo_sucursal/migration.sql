-- DB-15.1 (H15): la alerta guarda la sucursal para listarla por sucursal.
ALTER TABLE "alerta_insumo" ADD COLUMN "sucursal_id" INTEGER;

UPDATE "alerta_insumo" AS a
SET "sucursal_id" = i."sucursal_id"
FROM "insumo" AS i
WHERE i."id" = a."insumo_id";

ALTER TABLE "alerta_insumo" ALTER COLUMN "sucursal_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "alerta_insumo_sucursal_id_estado_idx" ON "alerta_insumo"("sucursal_id", "estado");

-- AddForeignKey
ALTER TABLE "alerta_insumo" ADD CONSTRAINT "alerta_insumo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
