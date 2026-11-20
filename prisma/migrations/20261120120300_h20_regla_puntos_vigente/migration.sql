-- Conserva las reglas históricas y protege la unicidad incluso fuera de la API.
CREATE UNIQUE INDEX regla_puntos_activa_unica
  ON regla_puntos (activa) WHERE activa = true;
