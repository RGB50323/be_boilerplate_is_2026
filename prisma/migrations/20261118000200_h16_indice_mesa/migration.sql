BEGIN;
DROP INDEX pedido_abierto_unico_por_mesa;
CREATE UNIQUE INDEX pedido_abierto_unico_por_mesa ON pedido (mesa_id)
  WHERE mesa_id IS NOT NULL AND estado NOT IN ('ENTREGADO', 'CANCELADO', 'CERRADO');
COMMIT;
