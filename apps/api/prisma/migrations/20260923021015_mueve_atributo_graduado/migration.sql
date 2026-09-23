-- Mueve AtributoGraduado del schema plan_estudios al schema
-- atributos_graduado. Prisma 7.9.1 genera DROP/CREATE para este
-- movimiento en vez de SET SCHEMA cuando hay FKs entrantes reales
-- (CompetenciaAtributo.atributoId, PlanAtributo.atributoId) —
-- limitación conocida del motor de diffing con multiSchema (mismo
-- caso ya resuelto en academico/Task 1 y objetivos-educacionales/Task 1).
-- Este SQL está escrito a mano porque SET SCHEMA es la operación
-- nativa de Postgres correcta aquí: no borra filas, y las FKs
-- entrantes se preservan automáticamente porque referencian el OID
-- de la tabla, no su nombre calificado por schema.

CREATE SCHEMA IF NOT EXISTS "atributos_graduado";

ALTER TABLE "plan_estudios"."atributos_graduado" SET SCHEMA "atributos_graduado";
