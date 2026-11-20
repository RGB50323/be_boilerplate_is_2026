ALTER TABLE "pago"
  ADD COLUMN "correo_lealtad" VARCHAR(254),
  ADD COLUMN "cliente_lealtad_id" UUID,
  ADD CONSTRAINT "pago_cliente_lealtad_id_fkey"
    FOREIGN KEY ("cliente_lealtad_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pago_correo_lealtad_chk"
    CHECK ("correo_lealtad" IS NULL OR "cliente_lealtad_id" IS NOT NULL);

CREATE TYPE "estado_acreditacion_puntos" AS ENUM ('PENDIENTE', 'LIBERADA', 'CANCELADA');

CREATE TABLE "acreditacion_puntos" (
  "id" SERIAL PRIMARY KEY,
  "cuenta_puntos_id" INTEGER NOT NULL REFERENCES "cuenta_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "pago_id" INTEGER NOT NULL REFERENCES "pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "regla_id" INTEGER NOT NULL REFERENCES "regla_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "puntos_por_dolar" INTEGER NOT NULL,
  "puntos_exactos" DECIMAL(13,2) NOT NULL,
  "puntos" INTEGER NOT NULL,
  "confirmado_en" TIMESTAMP(3) NOT NULL,
  "liberable_en" TIMESTAMP(3) NOT NULL,
  "estado" "estado_acreditacion_puntos" NOT NULL DEFAULT 'PENDIENTE',
  "liberada_en" TIMESTAMP(3),
  "cancelada_en" TIMESTAMP(3),
  CONSTRAINT "acreditacion_puntos_puntos_chk" CHECK (
    "puntos" >= 0 AND "puntos_exactos" >= 0 AND "puntos_por_dolar" BETWEEN 1 AND 10
    AND ("estado" = 'CANCELADA' OR "puntos" = floor("puntos_exactos"))
  ),
  CONSTRAINT "acreditacion_puntos_estado_chk" CHECK (
    ("estado" = 'PENDIENTE' AND "liberada_en" IS NULL AND "cancelada_en" IS NULL)
    OR ("estado" = 'LIBERADA' AND "liberada_en" IS NOT NULL
        AND "liberada_en" >= "liberable_en" AND "cancelada_en" IS NULL)
    OR ("estado" = 'CANCELADA' AND "cancelada_en" IS NOT NULL AND "liberada_en" IS NULL
        AND "cancelada_en" < "liberable_en" AND "puntos" = 0)
  )
);

CREATE UNIQUE INDEX "acreditacion_puntos_pago_id_key" ON "acreditacion_puntos"("pago_id");
CREATE INDEX "acreditacion_puntos_estado_liberable_en_id_idx"
  ON "acreditacion_puntos"("estado", "liberable_en", "id");
CREATE INDEX "acreditacion_puntos_cuenta_puntos_id_confirmado_en_idx"
  ON "acreditacion_puntos"("cuenta_puntos_id", "confirmado_en" DESC);
