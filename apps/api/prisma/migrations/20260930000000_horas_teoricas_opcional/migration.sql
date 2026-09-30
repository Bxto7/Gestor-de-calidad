-- RF-CH-020: «Horas teóricas» deja de existir en el flujo de asignaturas.
--
-- La columna se conserva, opcional y sin uso, para no perder los valores ya
-- cargados; su borrado queda para una migración posterior, cuando nada la lea.
-- El CHECK se quita porque ya no hay regla que imponer sobre un dato que nadie
-- escribe. No se toca ninguna fila.

-- DropCheck (Prisma no modela los CHECK: por eso esta línea es SQL a mano).
ALTER TABLE "plan_estudios"."asignaturas" DROP CONSTRAINT "asignaturas_horas_no_negativas";

-- AlterTable
ALTER TABLE "plan_estudios"."asignaturas" ALTER COLUMN "horas_teoricas" DROP NOT NULL;
