-- AlterTable
ALTER TABLE "detalle_pedido" ADD COLUMN     "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "pedido" ADD COLUMN     "mesero_id" UUID;

-- CreateIndex
CREATE INDEX "pedido_mesero_id_idx" ON "pedido"("mesero_id");

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_mesero_id_fkey" FOREIGN KEY ("mesero_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una mesa tiene a lo sumo un pedido abierto (no ENTREGADO ni CANCELADO).
CREATE UNIQUE INDEX pedido_abierto_unico_por_mesa
  ON pedido (mesa_id)
  WHERE mesa_id IS NOT NULL AND estado NOT IN ('ENTREGADO', 'CANCELADO');