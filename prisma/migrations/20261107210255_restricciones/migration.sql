-- DropForeignKey
ALTER TABLE "comprobante" DROP CONSTRAINT "comprobante_transaccion_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "pago_transaccion_id_pedido_id_key" ON "pago"("transaccion_id", "pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_transaccion_id_ticket_id_key" ON "comprobante"("transaccion_id", "ticket_id");

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_transaccion_id_ticket_id_fkey" FOREIGN KEY ("transaccion_id", "ticket_id") REFERENCES "pago"("transaccion_id", "pedido_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones y vista que Prisma no puede expresar en schema.prisma.

-- ============================================================
-- Nombres únicos sin distinguir mayúsculas
-- ============================================================

-- DB-3.1 (H03): no puede haber dos categorías con el mismo nombre.
CREATE UNIQUE INDEX categoria_nombre_ci ON categoria (lower(nombre));

-- H02 (BE-2.x): "nombre duplicado (sin distinguir mayúsculas)" → 409.
CREATE UNIQUE INDEX platillo_nombre_ci ON platillo (lower(nombre));

-- H14 (BE-14.x): "409 insumo duplicado en la sucursal".
CREATE UNIQUE INDEX insumo_sucursal_nombre_ci ON insumo (sucursal_id, lower(nombre));

-- ============================================================
-- Reservaciones (DB-10.1)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservacion ADD CONSTRAINT reservacion_rango_chk    CHECK (fin > inicio);
ALTER TABLE reservacion ADD CONSTRAINT reservacion_personas_chk CHECK (personas >= 1);
-- Una mesa no puede tener dos reservaciones CONFIRMADAS que se solapen.
-- Si dos clientes confirman al mismo tiempo, solo uno tiene éxito.
ALTER TABLE reservacion ADD CONSTRAINT reservacion_sin_solape
  EXCLUDE USING gist (mesa_id WITH =, tsrange(inicio, fin) WITH &&)
  WHERE (estado = 'CONFIRMADA');

-- ============================================================
-- Inventario (DB-14.1, DB-15.1)
-- ============================================================

ALTER TABLE insumo ADD CONSTRAINT insumo_cantidad_chk CHECK (cantidad >= 0);
ALTER TABLE insumo ADD CONSTRAINT insumo_minimo_chk   CHECK (minimo >= 0);
ALTER TABLE movimiento_insumo ADD CONSTRAINT movimiento_insumo_cantidad_chk CHECK (cantidad > 0);
-- Una sola alerta sin resolver (ACTIVA o VISTA) por insumo.
CREATE UNIQUE INDEX alerta_insumo_activa_unica
  ON alerta_insumo (insumo_id) WHERE estado <> 'RESUELTA';

-- ============================================================
-- Menú, mesas y pedidos
-- ============================================================

-- BE-2.x: "precio ≤ 0 o disponibilidad negativa" → 400.
ALTER TABLE platillo_sucursal ADD CONSTRAINT platillo_sucursal_precio_chk CHECK (precio > 0);
ALTER TABLE platillo_sucursal ADD CONSTRAINT platillo_sucursal_disp_chk   CHECK (disponibilidad >= 0);
ALTER TABLE mesa ADD CONSTRAINT mesa_capacidad_chk CHECK (capacidad > 0);
ALTER TABLE horario_sucursal ADD CONSTRAINT horario_dia_chk CHECK (dia_semana BETWEEN 0 AND 6);
ALTER TABLE detalle_pedido ADD CONSTRAINT detalle_cantidad_chk CHECK (cantidad > 0);
ALTER TABLE detalle_pedido ADD CONSTRAINT detalle_precio_chk   CHECK (precio_unitario >= 0);
ALTER TABLE pedido ADD CONSTRAINT pedido_montos_chk
  CHECK (subtotal >= 0 AND descuentos >= 0 AND impuestos >= 0 AND propina >= 0 AND total >= 0);

-- ============================================================
-- Pagos (H16)
-- ============================================================

-- No se puede pagar dos veces el mismo pedido, ni con doble clic.
-- Solo un pago PENDIENTE o CONFIRMADO por pedido; un RECHAZADO permite reintentar.
CREATE UNIQUE INDEX pago_activo_unico_por_pedido
  ON pago (pedido_id) WHERE estado IN ('PENDIENTE', 'CONFIRMADO');
ALTER TABLE pago ADD CONSTRAINT pago_monto_chk CHECK (monto > 0);

-- ============================================================
-- Lealtad (H18, H19, H20)
-- ============================================================

-- Dos canjes al mismo tiempo no pueden dejar el saldo negativo.
ALTER TABLE cuenta_puntos ADD CONSTRAINT cuenta_puntos_saldo_chk CHECK (saldo >= 0);
ALTER TABLE regla_puntos ADD CONSTRAINT regla_puntos_ppd_chk CHECK (puntos_por_dolar BETWEEN 1 AND 10);
ALTER TABLE beneficio ADD CONSTRAINT beneficio_costo_chk CHECK (costo_puntos > 0);
ALTER TABLE beneficio ADD CONSTRAINT beneficio_vigencia_chk
  CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde);
ALTER TABLE canje ADD CONSTRAINT canje_puntos_chk CHECK (puntos_usados > 0);

-- ============================================================
-- Reseñas (DB-21.1)
-- ============================================================

ALTER TABLE resena ADD CONSTRAINT resena_estrellas_chk CHECK (estrellas BETWEEN 1 AND 5);

-- ============================================================
-- Reportes (DB-28.1, H28 y H29)
-- ============================================================

-- Ventas = subtotal − descuentos, sin IVA ni propina; solo pagos CONFIRMADOS.
-- Un pago reembolsado pasa a REEMBOLSADO y sale de la vista solo.
CREATE VIEW venta_confirmada AS
SELECT
  p.id                        AS pedido_id,
  p.sucursal_id               AS sucursal_id,
  pg.confirmado_en            AS fecha_pago,
  (p.subtotal - p.descuentos) AS monto_neto
FROM pedido p
JOIN pago pg ON pg.pedido_id = p.id
WHERE pg.estado = 'CONFIRMADO';
