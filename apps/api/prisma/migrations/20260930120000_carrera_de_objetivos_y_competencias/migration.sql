-- RF-CH-015 / RF-CH-017 (Bloque 4b): objetivos educacionales y competencias
-- pasan a tener carrera propia, la del plan en el que se crean.
--
-- La columna es nullable: las filas existentes se rellenan desde sus vínculos
-- con planes solo cuando todos apuntan a una misma carrera; las ambiguas y las
-- que no tienen ningún vínculo quedan en NULL y se cuentan con RAISE NOTICE.
-- El nombre pasa a ser único por carrera (se abandona la unicidad global, que
-- solo comprobaba la aplicación). El código sigue siendo el correlativo global.

-- AlterTable
ALTER TABLE "objetivos_educacionales"."objetivos_educacionales" ADD COLUMN     "carrera_id" UUID;

-- AlterTable
ALTER TABLE "plan_estudios"."competencias" ADD COLUMN     "carrera_id" UUID;

-- AddForeignKey
ALTER TABLE "objetivos_educacionales"."objetivos_educacionales" ADD CONSTRAINT "objetivos_educacionales_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "academico"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."competencias" ADD CONSTRAINT "competencias_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "academico"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Relleno (SQL a mano). Cada sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-carrera-catalogo.int.spec.ts` la extrae por sus
-- marcas y la ejecuta sobre casos conocidos. No cambiar las marcas.
-- ============================================================================

-- Objetivo: la carrera de los planes que lo vinculan, si es una sola.
-- relleno-objetivos:inicio
UPDATE "objetivos_educacionales"."objetivos_educacionales" AS o
   SET "carrera_id" = u.carrera_id
  FROM (
    SELECT po."objetivo_id" AS objetivo_id,
           (array_agg(DISTINCT p."carrera_id"))[1] AS carrera_id
      FROM "plan_estudios"."plan_objetivo" po
      JOIN "plan_estudios"."planes_estudio" p ON p."id" = po."plan_id"
     GROUP BY po."objetivo_id"
    HAVING COUNT(DISTINCT p."carrera_id") = 1
  ) AS u
 WHERE u.objetivo_id = o."id";
-- relleno-objetivos:fin

-- Competencia: la carrera de los planes que la vinculan directamente
-- (`plan_competencia`) y de los planes de las asignaturas que la usan
-- (`asignatura_competencia`): los dos son vínculos con un plan.
-- relleno-competencias:inicio
UPDATE "plan_estudios"."competencias" AS c
   SET "carrera_id" = u.carrera_id
  FROM (
    SELECT v.competencia_id,
           (array_agg(DISTINCT v.carrera_id))[1] AS carrera_id
      FROM (
        SELECT pc."competencia_id" AS competencia_id, p."carrera_id" AS carrera_id
          FROM "plan_estudios"."plan_competencia" pc
          JOIN "plan_estudios"."planes_estudio" p ON p."id" = pc."plan_id"
        UNION
        SELECT ac."competencia_id", p."carrera_id"
          FROM "plan_estudios"."asignatura_competencia" ac
          JOIN "plan_estudios"."asignaturas" a ON a."id" = ac."asignatura_id"
          JOIN "plan_estudios"."planes_estudio" p ON p."id" = a."plan_id"
      ) AS v
     GROUP BY v.competencia_id
    HAVING COUNT(DISTINCT v.carrera_id) = 1
  ) AS u
 WHERE u.competencia_id = c."id";
-- relleno-competencias:fin

-- Recuento del relleno, para quien aplique la migración en un entorno real.
DO $$
DECLARE
  o_con_carrera integer;
  o_ambiguos    integer;
  o_sin_vinculo integer;
  c_con_carrera integer;
  c_ambiguas    integer;
  c_sin_vinculo integer;
BEGIN
  SELECT
    (SELECT count(*) FROM "objetivos_educacionales"."objetivos_educacionales" o
      WHERE o."carrera_id" IS NOT NULL),
    (SELECT count(*) FROM "objetivos_educacionales"."objetivos_educacionales" o
      WHERE o."carrera_id" IS NULL
        AND EXISTS (SELECT 1 FROM "plan_estudios"."plan_objetivo" po
                     WHERE po."objetivo_id" = o."id")),
    (SELECT count(*) FROM "objetivos_educacionales"."objetivos_educacionales" o
      WHERE NOT EXISTS (SELECT 1 FROM "plan_estudios"."plan_objetivo" po
                         WHERE po."objetivo_id" = o."id"))
    INTO o_con_carrera, o_ambiguos, o_sin_vinculo;

  SELECT
    (SELECT count(*) FROM "plan_estudios"."competencias" c
      WHERE c."carrera_id" IS NOT NULL),
    (SELECT count(*) FROM "plan_estudios"."competencias" c
      WHERE c."carrera_id" IS NULL
        AND (EXISTS (SELECT 1 FROM "plan_estudios"."plan_competencia" pc
                      WHERE pc."competencia_id" = c."id")
          OR EXISTS (SELECT 1 FROM "plan_estudios"."asignatura_competencia" ac
                      WHERE ac."competencia_id" = c."id"))),
    (SELECT count(*) FROM "plan_estudios"."competencias" c
      WHERE NOT EXISTS (SELECT 1 FROM "plan_estudios"."plan_competencia" pc
                         WHERE pc."competencia_id" = c."id")
        AND NOT EXISTS (SELECT 1 FROM "plan_estudios"."asignatura_competencia" ac
                         WHERE ac."competencia_id" = c."id"))
    INTO c_con_carrera, c_ambiguas, c_sin_vinculo;

  RAISE NOTICE 'Objetivos educacionales: % con carrera, % ambiguos (planes de varias carreras), % sin vínculo.',
    o_con_carrera, o_ambiguos, o_sin_vinculo;
  RAISE NOTICE 'Competencias: % con carrera, % ambiguas (planes de varias carreras), % sin vínculo.',
    c_con_carrera, c_ambiguas, c_sin_vinculo;
END $$;

-- Antes del índice: abortar con un mensaje claro si ya hay nombres repetidos
-- dentro de una carrera. No debería haberlos —la aplicación exigía unicidad
-- global—, pero los scripts de carga escriben con upsert y se la saltan.
DO $$
DECLARE
  repetidos text;
BEGIN
  SELECT string_agg(format('«%s» (carrera %s)', d.nombre, d.carrera_id), '; ')
    INTO repetidos
    FROM (
      SELECT min("nombre") AS nombre, "carrera_id" AS carrera_id
        FROM "objetivos_educacionales"."objetivos_educacionales"
       WHERE "carrera_id" IS NOT NULL
       GROUP BY "carrera_id", lower("nombre")
      HAVING count(*) > 1
    ) AS d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Objetivos educacionales con el mismo nombre en la misma carrera: %. Renómbralos antes de aplicar esta migración.', repetidos;
  END IF;

  SELECT string_agg(format('«%s» (carrera %s)', d.nombre, d.carrera_id), '; ')
    INTO repetidos
    FROM (
      SELECT min("nombre") AS nombre, "carrera_id" AS carrera_id
        FROM "plan_estudios"."competencias"
       WHERE "carrera_id" IS NOT NULL
       GROUP BY "carrera_id", lower("nombre")
      HAVING count(*) > 1
    ) AS d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Competencias con el mismo nombre en la misma carrera: %. Renómbralas antes de aplicar esta migración.', repetidos;
  END IF;
END $$;

-- Nombre único por carrera, sin distinguir mayúsculas (igual que
-- `existeNombre`). Índice parcial: Prisma no lo modela y `migrate diff` lo
-- ignora, como `planes_una_vigente_por_carrera`. Las filas con carrera NULL
-- quedan fuera: PostgreSQL trata cada NULL como distinto.
CREATE UNIQUE INDEX "objetivos_educacionales_nombre_por_carrera"
  ON "objetivos_educacionales"."objetivos_educacionales" ("carrera_id", lower("nombre"))
  WHERE "carrera_id" IS NOT NULL;

CREATE UNIQUE INDEX "competencias_nombre_por_carrera"
  ON "plan_estudios"."competencias" ("carrera_id", lower("nombre"))
  WHERE "carrera_id" IS NOT NULL;
