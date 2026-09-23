-- Mueve ObjetivoEducacional del schema plan_estudios al schema
-- objetivos_educacionales. Prisma 7.9.1 genera DROP/CREATE para este
-- movimiento en vez de SET SCHEMA cuando hay una FK entrante real
-- (PlanObjetivo.objetivoId) — limitación conocida del motor de diffing
-- con multiSchema (ver academico/Task 1, mismo caso). Este SQL está
-- escrito a mano porque SET SCHEMA es la operación nativa de Postgres
-- correcta aquí: no borra filas, y la FK entrante se preserva
-- automáticamente porque referencia el OID de la tabla, no su nombre
-- calificado por schema.

CREATE SCHEMA IF NOT EXISTS "objetivos_educacionales";

ALTER TABLE "plan_estudios"."objetivos_educacionales" SET SCHEMA "objetivos_educacionales";
