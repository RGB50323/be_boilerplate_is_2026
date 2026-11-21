-- CreateEnum
CREATE TYPE "rol" AS ENUM ('CLIENTE', 'MESERO', 'COCINA', 'GERENTE', 'GERENTE_GENERAL');

-- CreateEnum
CREATE TYPE "tipo_pedido" AS ENUM ('MESA', 'LLEVAR');

-- CreateEnum
CREATE TYPE "estado_pedido" AS ENUM ('PENDIENTE_PAGO', 'RECIBIDO', 'ENVIADO_COCINA', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "estado_item" AS ENUM ('PENDIENTE', 'LISTO', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "estado_reservacion" AS ENUM ('CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "unidad_insumo" AS ENUM ('LB', 'KG', 'L', 'UNIDAD');

-- CreateEnum
CREATE TYPE "tipo_movimiento_insumo" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "estado_alerta" AS ENUM ('ACTIVA', 'VISTA', 'RESUELTA');

-- CreateEnum
CREATE TYPE "estado_pago" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'REEMBOLSADO');

-- CreateEnum
CREATE TYPE "tipo_movimiento_puntos" AS ENUM ('ACUMULACION', 'CANJE', 'AJUSTE');

-- CreateEnum
CREATE TYPE "entidad_lealtad" AS ENUM ('REGLA', 'BENEFICIO');

-- CreateEnum
CREATE TYPE "accion_lealtad" AS ENUM ('CREACION', 'MODIFICACION', 'DESHABILITACION');

-- CreateEnum
CREATE TYPE "estado_resena" AS ENUM ('VISIBLE', 'OCULTA');

-- CreateEnum
CREATE TYPE "motivo_ocultacion" AS ENUM ('OFENSIVO', 'SPAM', 'NO_RELACIONADO');

-- CreateEnum
CREATE TYPE "modulo_origen" AS ENUM ('MENU', 'PEDIDOS', 'COCINA', 'RESERVACIONES', 'INVENTARIO', 'PAGOS', 'LEALTAD', 'RESENAS', 'REPORTES');

-- CreateEnum
CREATE TYPE "estado_correo" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "apellido" VARCHAR(80),
ADD COLUMN     "nombre" VARCHAR(80),
ADD COLUMN     "rol" "rol" NOT NULL DEFAULT 'CLIENTE',
ADD COLUMN     "sucursal_id" INTEGER;

-- CreateTable
CREATE TABLE "sucursal" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "direccion" VARCHAR(200),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "deshabilitada_en" TIMESTAMP(3),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platillo" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "imagen_url" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platillo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platillo_sucursal" (
    "id" SERIAL NOT NULL,
    "platillo_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "disponibilidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platillo_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesa" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 4,
    "zona" VARCHAR(40),
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(20),
    "tipo" "tipo_pedido" NOT NULL,
    "estado" "estado_pedido" NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "mesa_id" INTEGER,
    "cliente_id" UUID,
    "nombre_cliente" VARCHAR(120),
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "descuentos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "impuestos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "propina" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_pedido" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "platillo_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "nota" VARCHAR(200),
    "estado" "estado_item" NOT NULL DEFAULT 'PENDIENTE',
    "listo_en" TIMESTAMP(3),
    "entregado_en" TIMESTAMP(3),
    "entregado_por_id" UUID,

    CONSTRAINT "detalle_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_sucursal" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "apertura" TIME(0) NOT NULL,
    "cierre" TIME(0) NOT NULL,

    CONSTRAINT "horario_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservacion" (
    "id" SERIAL NOT NULL,
    "mesa_id" INTEGER NOT NULL,
    "cliente_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "telefono" VARCHAR(9) NOT NULL,
    "correo" VARCHAR(160) NOT NULL,
    "personas" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "estado_reservacion" NOT NULL DEFAULT 'CONFIRMADA',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificada_en" TIMESTAMP(3),
    "cancelada_en" TIMESTAMP(3),
    "recordatorio_enviado_en" TIMESTAMP(3),

    CONSTRAINT "reservacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumo" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "unidad" "unidad_insumo" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_insumo" (
    "id" SERIAL NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "tipo" "tipo_movimiento_insumo" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "cantidad_anterior" DECIMAL(12,3) NOT NULL,
    "cantidad_actual" DECIMAL(12,3) NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "usuario_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_insumo" (
    "id" SERIAL NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "estado" "estado_alerta" NOT NULL DEFAULT 'ACTIVA',
    "cantidad" DECIMAL(12,3) NOT NULL,
    "minimo" DECIMAL(12,3) NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vista_en" TIMESTAMP(3),
    "resuelta_en" TIMESTAMP(3),

    CONSTRAINT "alerta_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "transaccion_id" VARCHAR(80),
    "monto" DECIMAL(10,2) NOT NULL,
    "estado" "estado_pago" NOT NULL DEFAULT 'PENDIENTE',
    "metodo" VARCHAR(30),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "confirmado_en" TIMESTAMP(3),
    "reembolsado_en" TIMESTAMP(3),

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "transaccion_id" VARCHAR(80) NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivo_url" VARCHAR(255),

    CONSTRAINT "comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_puntos" (
    "id" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "saldo" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regla_puntos" (
    "id" SERIAL NOT NULL,
    "puntos_por_dolar" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificada_en" TIMESTAMP(3),
    "deshabilitada_en" TIMESTAMP(3),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regla_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficio" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(200),
    "costo_puntos" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "vigente_desde" TIMESTAMP(3),
    "vigente_hasta" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_en" TIMESTAMP(3),
    "deshabilitado_en" TIMESTAMP(3),

    CONSTRAINT "beneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canje" (
    "id" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "beneficio_id" INTEGER NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "puntos_usados" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(64),
    "pedido_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_puntos" (
    "id" SERIAL NOT NULL,
    "cuenta_puntos_id" INTEGER NOT NULL,
    "tipo" "tipo_movimiento_puntos" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "saldo_anterior" INTEGER NOT NULL,
    "saldo_resultante" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "canje_id" INTEGER,
    "regla_id" INTEGER,
    "puntos_por_dolar" INTEGER,
    "motivo" VARCHAR(200),
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_lealtad" (
    "id" SERIAL NOT NULL,
    "entidad" "entidad_lealtad" NOT NULL,
    "entidad_id" INTEGER NOT NULL,
    "accion" "accion_lealtad" NOT NULL,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "usuario_id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_lealtad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resena" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "platillo_id" INTEGER NOT NULL,
    "cliente_id" UUID NOT NULL,
    "estrellas" INTEGER NOT NULL,
    "comentario" VARCHAR(500),
    "estado" "estado_resena" NOT NULL DEFAULT 'VISIBLE',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oculta_por_id" UUID,
    "oculta_en" TIMESTAMP(3),
    "motivo_ocultacion" "motivo_ocultacion",

    CONSTRAINT "resena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL,
    "destinatario_id" UUID NOT NULL,
    "titulo" VARCHAR(100) NOT NULL,
    "mensaje" VARCHAR(500) NOT NULL,
    "modulo_origen" "modulo_origen" NOT NULL,
    "referencia_tipo" VARCHAR(40),
    "referencia_id" VARCHAR(64),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leida_en" TIMESTAMP(3),
    "estado_correo" "estado_correo",
    "intentos_correo" INTEGER NOT NULL DEFAULT 0,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_nombre_key" ON "sucursal"("nombre");

-- CreateIndex
CREATE INDEX "platillo_categoria_id_idx" ON "platillo"("categoria_id");

-- CreateIndex
CREATE INDEX "platillo_sucursal_sucursal_id_disponibilidad_idx" ON "platillo_sucursal"("sucursal_id", "disponibilidad");

-- CreateIndex
CREATE UNIQUE INDEX "platillo_sucursal_platillo_id_sucursal_id_key" ON "platillo_sucursal"("platillo_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "mesa_sucursal_id_numero_key" ON "mesa"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "pedido_sucursal_id_estado_creado_en_idx" ON "pedido"("sucursal_id", "estado", "creado_en");

-- CreateIndex
CREATE INDEX "pedido_cliente_id_idx" ON "pedido"("cliente_id");

-- CreateIndex
CREATE INDEX "pedido_mesa_id_idx" ON "pedido"("mesa_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_sucursal_id_numero_key" ON "pedido"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "detalle_pedido_pedido_id_idx" ON "detalle_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "detalle_pedido_estado_idx" ON "detalle_pedido"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "horario_sucursal_sucursal_id_dia_semana_key" ON "horario_sucursal"("sucursal_id", "dia_semana");

-- CreateIndex
CREATE INDEX "reservacion_cliente_id_estado_idx" ON "reservacion"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "reservacion_estado_inicio_idx" ON "reservacion"("estado", "inicio");

-- CreateIndex
CREATE INDEX "insumo_sucursal_id_idx" ON "insumo"("sucursal_id");

-- CreateIndex
CREATE INDEX "movimiento_insumo_insumo_id_creado_en_idx" ON "movimiento_insumo"("insumo_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "alerta_insumo_insumo_id_estado_idx" ON "alerta_insumo"("insumo_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "pago_idempotency_key_key" ON "pago"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "pago_transaccion_id_key" ON "pago"("transaccion_id");

-- CreateIndex
CREATE INDEX "pago_pedido_id_estado_idx" ON "pago"("pedido_id", "estado");

-- CreateIndex
CREATE INDEX "pago_estado_confirmado_en_idx" ON "pago"("estado", "confirmado_en");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_numero_key" ON "comprobante"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_transaccion_id_key" ON "comprobante"("transaccion_id");

-- CreateIndex
CREATE INDEX "comprobante_ticket_id_idx" ON "comprobante"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_puntos_cliente_id_key" ON "cuenta_puntos"("cliente_id");

-- CreateIndex
CREATE INDEX "regla_puntos_activa_vigente_desde_idx" ON "regla_puntos"("activa", "vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "canje_codigo_key" ON "canje"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "canje_idempotency_key_key" ON "canje"("idempotency_key");

-- CreateIndex
CREATE INDEX "canje_cliente_id_idx" ON "canje"("cliente_id");

-- CreateIndex
CREATE INDEX "movimiento_puntos_cuenta_puntos_id_fecha_idx" ON "movimiento_puntos"("cuenta_puntos_id", "fecha" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_puntos_pedido_id_tipo_key" ON "movimiento_puntos"("pedido_id", "tipo");

-- CreateIndex
CREATE INDEX "historial_lealtad_entidad_entidad_id_idx" ON "historial_lealtad"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "resena_platillo_id_estado_creada_en_idx" ON "resena"("platillo_id", "estado", "creada_en" DESC);

-- CreateIndex
CREATE INDEX "resena_cliente_id_idx" ON "resena"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "resena_pedido_id_platillo_id_key" ON "resena"("pedido_id", "platillo_id");

-- CreateIndex
CREATE INDEX "notificacion_destinatario_id_leida_creada_en_idx" ON "notificacion"("destinatario_id", "leida", "creada_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_modulo_origen_referencia_tipo_referencia_id_de_key" ON "notificacion"("modulo_origen", "referencia_tipo", "referencia_id", "destinatario_id");

-- CreateIndex
CREATE INDEX "users_sucursal_id_idx" ON "users"("sucursal_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platillo" ADD CONSTRAINT "platillo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platillo_sucursal" ADD CONSTRAINT "platillo_sucursal_platillo_id_fkey" FOREIGN KEY ("platillo_id") REFERENCES "platillo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platillo_sucursal" ADD CONSTRAINT "platillo_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesa" ADD CONSTRAINT "mesa_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_platillo_id_fkey" FOREIGN KEY ("platillo_id") REFERENCES "platillo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido" ADD CONSTRAINT "detalle_pedido_entregado_por_id_fkey" FOREIGN KEY ("entregado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_sucursal" ADD CONSTRAINT "horario_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservacion" ADD CONSTRAINT "reservacion_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservacion" ADD CONSTRAINT "reservacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_insumo" ADD CONSTRAINT "movimiento_insumo_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_insumo" ADD CONSTRAINT "movimiento_insumo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_insumo" ADD CONSTRAINT "alerta_insumo_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "pago"("transaccion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_puntos" ADD CONSTRAINT "cuenta_puntos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canje" ADD CONSTRAINT "canje_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canje" ADD CONSTRAINT "canje_beneficio_id_fkey" FOREIGN KEY ("beneficio_id") REFERENCES "beneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canje" ADD CONSTRAINT "canje_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_cuenta_puntos_id_fkey" FOREIGN KEY ("cuenta_puntos_id") REFERENCES "cuenta_puntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_canje_id_fkey" FOREIGN KEY ("canje_id") REFERENCES "canje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "regla_puntos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_lealtad" ADD CONSTRAINT "historial_lealtad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_platillo_id_fkey" FOREIGN KEY ("platillo_id") REFERENCES "platillo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_oculta_por_id_fkey" FOREIGN KEY ("oculta_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
