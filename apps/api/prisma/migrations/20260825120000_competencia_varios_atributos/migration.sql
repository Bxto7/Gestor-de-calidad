-- Una competencia puede desarrollar varios atributos del graduado.
--
-- El orden importa: `prisma migrate diff` genera primero el DROP COLUMN y
-- después el CREATE TABLE, lo que se llevaría por delante los mapeos ya
-- cargados. Aquí se crea la tabla, se copia lo que había y solo entonces se
-- suelta la columna vieja.

-- 1. La tabla puente.
CREATE TABLE "plan_estudios"."competencia_atributo" (
    "competencia_id" UUID NOT NULL,
    "atributo_id" UUID NOT NULL,

    CONSTRAINT "competencia_atributo_pkey" PRIMARY KEY ("competencia_id","atributo_id")
);

CREATE INDEX "competencia_atributo_atributo_id_idx"
  ON "plan_estudios"."competencia_atributo"("atributo_id");

ALTER TABLE "plan_estudios"."competencia_atributo"
  ADD CONSTRAINT "competencia_atributo_competencia_id_fkey"
  FOREIGN KEY ("competencia_id") REFERENCES "plan_estudios"."competencias"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_estudios"."competencia_atributo"
  ADD CONSTRAINT "competencia_atributo_atributo_id_fkey"
  FOREIGN KEY ("atributo_id") REFERENCES "plan_estudios"."atributos_graduado"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Trasladar los mapeos existentes antes de perder la columna.
INSERT INTO "plan_estudios"."competencia_atributo" ("competencia_id", "atributo_id")
SELECT "id", "atributo_graduado_id"
  FROM "plan_estudios"."competencias"
  WHERE "atributo_graduado_id" IS NOT NULL;

-- 3. Ahora sí, retirar la referencia única.
ALTER TABLE "plan_estudios"."competencias"
  DROP CONSTRAINT "competencias_atributo_graduado_id_fkey";

ALTER TABLE "plan_estudios"."competencias"
  DROP COLUMN "atributo_graduado_id";
