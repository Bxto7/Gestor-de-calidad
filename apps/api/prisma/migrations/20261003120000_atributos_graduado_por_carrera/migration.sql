-- RF-CH-027 / RF-CH-028 (Bloque 5): los atributos del graduado pasan a tener
-- carrera propia.
--
-- Hasta ahora eran un catálogo global (los 11 de ICACIT, único por marco y
-- código). Cada carrera existente recibe su copia —mismo marco, código, nombre,
-- orden y estado—, los vínculos de competencias y de planes se remapean a la
-- copia de su carrera, y los globales se borran. Una carrera creada después
-- empieza sin atributos (decisión 2 del diseño).
--
-- Una competencia sin carrera (heredada del 4b) no se puede remapear sin
-- adivinar: su vínculo se elimina. El `RAISE NOTICE` de la sección
-- `aviso-sin-carrera` NO se ve en la salida de `prisma migrate deploy` (se
-- comprobó contra una base desechable con una competencia sin carrera vinculada:
-- la salida no lo muestra), así que no es una señal fiable. ANTES de desplegar,
-- ejecutar esta consulta y guardar su resultado; lista los vínculos que se
-- perderán (sin filas = no se pierde nada):
--
--   SELECT c."codigo" AS competencia, g."codigo" AS atributo
--     FROM "plan_estudios"."competencia_atributo" AS ca
--     JOIN "plan_estudios"."competencias" AS c ON c."id" = ca."competencia_id"
--     JOIN "atributos_graduado"."atributos_graduado" AS g ON g."id" = ca."atributo_id"
--    WHERE c."carrera_id" IS NULL
--    ORDER BY 1, 2;
--
-- Los eventos de `auditoria.audit_log` conservan los ids de los atributos
-- globales borrados: no hay otra huella de ellos en la base tras la migración.
--
-- Todo el archivo corre como una sola transacción: PostgreSQL ejecuta un
-- comando multi-sentencia en una transacción implícita.

-- AlterTable
ALTER TABLE "atributos_graduado"."atributos_graduado" ADD COLUMN     "carrera_id" UUID;

-- La unicidad (marco, codigo) deja de valer: las copias repiten el código en
-- cada carrera. Se reemplaza al final por (carrera_id, marco, codigo).
DROP INDEX "atributos_graduado"."atributos_graduado_marco_codigo_key";

-- ============================================================================
-- Relleno (SQL a mano). Cada sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-atributos-por-carrera.int.spec.ts` la extrae por
-- sus marcas y la ejecuta sobre casos conocidos. No cambiar las marcas ni el
-- orden.
-- ============================================================================

-- Una copia de cada atributo global por cada carrera (también las inactivas).
-- copia-atributos:inicio
INSERT INTO "atributos_graduado"."atributos_graduado"
  ("id", "marco", "codigo", "nombre", "orden", "estado", "creado_en", "actualizado_en", "carrera_id")
SELECT gen_random_uuid(), g."marco", g."codigo", g."nombre", g."orden", g."estado",
       g."creado_en", g."actualizado_en", c."id"
  FROM "atributos_graduado"."atributos_graduado" AS g
 CROSS JOIN "academico"."carreras" AS c
 WHERE g."carrera_id" IS NULL;
-- copia-atributos:fin

-- Aviso para quien aplique la migración en un entorno real: qué vínculos se
-- perderán porque su competencia no tiene carrera. Va antes del borrado.
-- aviso-sin-carrera:inicio
DO $$
DECLARE
  vinculos integer;
  competencias text;
BEGIN
  SELECT count(*), coalesce(string_agg(DISTINCT c."codigo", ', '), 'ninguna')
    INTO vinculos, competencias
    FROM "plan_estudios"."competencia_atributo" AS ca
    JOIN "atributos_graduado"."atributos_graduado" AS g
      ON g."id" = ca."atributo_id" AND g."carrera_id" IS NULL
    JOIN "plan_estudios"."competencias" AS c ON c."id" = ca."competencia_id"
   WHERE c."carrera_id" IS NULL;
  RAISE NOTICE 'Atributos del graduado: % vínculo(s) de competencias sin carrera se eliminan (competencias: %).',
    vinculos, competencias;
END $$;
-- aviso-sin-carrera:fin

-- Cada vínculo de competencia pasa a la copia de la carrera de la competencia,
-- con el mismo marco y código.
-- remapeo-competencias:inicio
UPDATE "plan_estudios"."competencia_atributo" AS ca
   SET "atributo_id" = copia."id"
  FROM "plan_estudios"."competencias" AS c,
       "atributos_graduado"."atributos_graduado" AS glob,
       "atributos_graduado"."atributos_graduado" AS copia
 WHERE c."id" = ca."competencia_id"
   AND c."carrera_id" IS NOT NULL
   AND glob."id" = ca."atributo_id"
   AND glob."carrera_id" IS NULL
   AND copia."carrera_id" = c."carrera_id"
   AND copia."marco" = glob."marco"
   AND copia."codigo" = glob."codigo";
-- remapeo-competencias:fin

-- Igual para los planes de estudio, por la carrera del plan (siempre existe).
-- remapeo-planes:inicio
UPDATE "plan_estudios"."plan_atributo" AS pa
   SET "atributo_id" = copia."id"
  FROM "plan_estudios"."planes_estudio" AS p,
       "atributos_graduado"."atributos_graduado" AS glob,
       "atributos_graduado"."atributos_graduado" AS copia
 WHERE p."id" = pa."plan_id"
   AND glob."id" = pa."atributo_id"
   AND glob."carrera_id" IS NULL
   AND copia."carrera_id" = p."carrera_id"
   AND copia."marco" = glob."marco"
   AND copia."codigo" = glob."codigo";
-- remapeo-planes:fin

-- Lo que todavía apunta a un global es de una competencia sin carrera.
-- vinculos-sin-carrera:inicio
DELETE FROM "plan_estudios"."competencia_atributo" AS ca
 USING "atributos_graduado"."atributos_graduado" AS g
 WHERE g."id" = ca."atributo_id"
   AND g."carrera_id" IS NULL;
-- vinculos-sin-carrera:fin

-- Ya nada referencia a los globales (`plan_atributo` es `Restrict`: si alguno
-- quedara apuntándolos, esta sentencia abortaría la migración entera).
-- globales:inicio
DELETE FROM "atributos_graduado"."atributos_graduado" WHERE "carrera_id" IS NULL;
-- globales:fin

-- AlterTable
ALTER TABLE "atributos_graduado"."atributos_graduado" ALTER COLUMN "carrera_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "atributos_graduado_carrera_id_idx" ON "atributos_graduado"."atributos_graduado"("carrera_id");

-- CreateIndex
CREATE UNIQUE INDEX "atributos_graduado_carrera_id_marco_codigo_key" ON "atributos_graduado"."atributos_graduado"("carrera_id", "marco", "codigo");

-- AddForeignKey
ALTER TABLE "atributos_graduado"."atributos_graduado" ADD CONSTRAINT "atributos_graduado_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "academico"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
