-- DropForeignKey
ALTER TABLE "comprobante" DROP CONSTRAINT "comprobante_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "comprobante" DROP CONSTRAINT "comprobante_transaccion_id_fkey";

-- DropIndex
DROP INDEX "comprobante_ticket_id_idx";

-- DropIndex
DROP INDEX "comprobante_transaccion_id_key";

-- DropIndex
DROP INDEX "insumo_sucursal_id_idx";

-- DropIndex
DROP INDEX "notificacion_modulo_origen_referencia_tipo_referencia_id_de_key";

-- AlterTable
ALTER TABLE "comprobante" DROP COLUMN "ticket_id",
DROP COLUMN "transaccion_id",
ADD COLUMN     "pago_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_pago_id_key" ON "comprobante"("pago_id");

-- CreateIndex
CREATE UNIQUE INDEX "insumo_sucursal_id_nombre_key" ON "insumo"("sucursal_id", "nombre");

-- CreateIndex
CREATE INDEX "reservacion_mesa_id_inicio_idx" ON "reservacion"("mesa_id", "inicio");

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- SQL escrito a mano: Prisma no genera CHECK ni exclusion constraints, pero
-- tampoco los elimina al calcular migraciones futuras.
-- ---------------------------------------------------------------------------

-- Evita el doble booking: dos reservaciones CONFIRMADAS de la misma mesa no
-- pueden traslaparse. El rango es [inicio, fin), así que una reserva puede
-- empezar exactamente cuando termina la anterior.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservacion" ADD CONSTRAINT "reservacion_mesa_sin_traslape"
    EXCLUDE USING gist ("mesa_id" WITH =, tsrange("inicio", "fin", '[)') WITH &&)
    WHERE ("estado" = 'CONFIRMADA');

-- Montos y precios
ALTER TABLE "platillo_sucursal" ADD CONSTRAINT "platillo_sucursal_precio_check" CHECK ("precio" >= 0);
ALTER TABLE "platillo_sucursal" ADD CONSTRAINT "platillo_sucursal_disponibilidad_check" CHECK ("disponibilidad" >= 0);
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_cantidad_check" CHECK ("cantidad" > 0);
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_precio_unitario_check" CHECK ("precio_unitario" >= 0);
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_montos_check" CHECK (
    "subtotal" >= 0 AND "descuentos" >= 0 AND "impuestos" >= 0 AND "propina" >= 0 AND "total" >= 0
);
ALTER TABLE "pago" ADD CONSTRAINT "pago_monto_check" CHECK ("monto" >= 0);

-- Lealtad: el saldo nunca puede quedar negativo, aunque dos canjes
-- concurrentes lean el mismo saldo antes de descontar.
ALTER TABLE "cuenta_puntos" ADD CONSTRAINT "cuenta_puntos_saldo_check" CHECK ("saldo" >= 0);

-- Reseñas
ALTER TABLE "resena" ADD CONSTRAINT "resena_estrellas_check" CHECK ("estrellas" BETWEEN 1 AND 5);

-- Reservaciones
ALTER TABLE "reservacion" ADD CONSTRAINT "reservacion_rango_check" CHECK ("fin" > "inicio");
ALTER TABLE "reservacion" ADD CONSTRAINT "reservacion_personas_check" CHECK ("personas" > 0);

-- Horarios: 0 = domingo ... 6 = sábado
ALTER TABLE "horario_sucursal" ADD CONSTRAINT "horario_sucursal_dia_semana_check" CHECK ("dia_semana" BETWEEN 0 AND 6);

-- Inventario
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_cantidades_check" CHECK ("cantidad" >= 0 AND "minimo" >= 0);
