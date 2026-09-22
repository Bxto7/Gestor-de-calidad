-- Mueve Facultad/Carrera/Ciclo del schema plan_estudios al schema academico.
-- Prisma 7.9.1 genera DROP/CREATE para este movimiento en vez de SET SCHEMA
-- (limitación conocida del motor de diffing con multiSchema) — este SQL está
-- escrito a mano porque SET SCHEMA es la operación nativa de Postgres
-- correcta aquí: no borra filas, y las FKs cruzadas (incluidas las que
-- apuntan desde plan_estudios) se preservan automáticamente porque
-- referencian el OID de la tabla, no su nombre calificado por schema.

CREATE SCHEMA IF NOT EXISTS "academico";

ALTER TABLE "plan_estudios"."facultades" SET SCHEMA "academico";
ALTER TABLE "plan_estudios"."carreras" SET SCHEMA "academico";
ALTER TABLE "plan_estudios"."ciclos" SET SCHEMA "academico";
