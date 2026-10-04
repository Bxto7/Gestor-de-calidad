-- RF-CH-033 / RF-CH-037 (Bloque 6a): los planes de medición y de evaluación
-- pasan a tener carrera propia.
--
-- Hasta ahora la carrera se derivaba: medición → plan de estudios, evaluación →
-- medición → plan de estudios. Con columna, el listado filtra en su propia tabla
-- y «queda asociado a la carrera» es un dato y no un cálculo. Sin clave foránea a
-- `academico.carreras`, igual que `PlanMejora` y `ActaAprobacion`.
--
-- Si algún plan no se puede asignar —su plan de estudios ya no existe: no hay
-- clave foránea en `plan_estudios_id`— la migración ABORTA con la lista de
-- códigos. No se pierde ni se inventa nada: se corrigen o eliminan esos planes y
-- se vuelve a aplicar. Todo el archivo corre en una sola transacción.

-- AlterTable
ALTER TABLE "mejora_continua"."planes_medicion" ADD COLUMN     "carrera_id" UUID;

-- AlterTable
ALTER TABLE "mejora_continua"."planes_evaluacion" ADD COLUMN     "carrera_id" UUID;

-- ============================================================================
-- Relleno (SQL a mano). Cada sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-carrera-de-planes.int.spec.ts` la extrae por sus
-- marcas y la ejecuta sobre casos conocidos. No cambiar las marcas ni el orden.
-- ============================================================================

-- La carrera de cada plan de medición es la de su plan de estudios.
-- relleno-medicion:inicio
UPDATE "mejora_continua"."planes_medicion" AS pm
   SET "carrera_id" = pe."carrera_id"
  FROM "plan_estudios"."planes_estudio" AS pe
 WHERE pe."id" = pm."plan_estudios_id"
   AND pm."carrera_id" IS NULL;
-- relleno-medicion:fin

-- La de cada plan de evaluación, la de su plan de medición base (ya rellenada).
-- relleno-evaluacion:inicio
UPDATE "mejora_continua"."planes_evaluacion" AS ev
   SET "carrera_id" = pm."carrera_id"
  FROM "mejora_continua"."planes_medicion" AS pm
 WHERE pm."id" = ev."plan_medicion_id"
   AND ev."carrera_id" IS NULL;
-- relleno-evaluacion:fin

-- Lo que siga sin carrera aborta la migración entera, con los códigos.
-- huerfanos:inicio
DO $$
DECLARE
  mediciones text;
  evaluaciones text;
BEGIN
  SELECT string_agg("codigo", ', ' ORDER BY "codigo") INTO mediciones
    FROM "mejora_continua"."planes_medicion" WHERE "carrera_id" IS NULL;
  SELECT string_agg("codigo", ', ' ORDER BY "codigo") INTO evaluaciones
    FROM "mejora_continua"."planes_evaluacion" WHERE "carrera_id" IS NULL;
  IF mediciones IS NOT NULL OR evaluaciones IS NOT NULL THEN
    RAISE EXCEPTION 'Hay planes sin carrera: su plan de estudios o su plan de medición base ya no existe. Planes de medición: %. Planes de evaluación: %. Corrige o elimina esos planes y vuelve a aplicar la migración.',
      coalesce(mediciones, 'ninguno'), coalesce(evaluaciones, 'ninguno');
  END IF;
END $$;
-- huerfanos:fin

-- AlterTable
ALTER TABLE "mejora_continua"."planes_medicion" ALTER COLUMN "carrera_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "mejora_continua"."planes_evaluacion" ALTER COLUMN "carrera_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "planes_medicion_carrera_id_idx" ON "mejora_continua"."planes_medicion"("carrera_id");

-- CreateIndex
CREATE INDEX "planes_evaluacion_carrera_id_idx" ON "mejora_continua"."planes_evaluacion"("carrera_id");
