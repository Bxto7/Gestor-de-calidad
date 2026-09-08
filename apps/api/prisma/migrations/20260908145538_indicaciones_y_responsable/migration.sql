-- CreateEnum
CREATE TYPE "mejora_continua"."GrupoObjetivo" AS ENUM ('EGRESADOS', 'EMPLEADORES', 'DOCENTES', 'ESTUDIANTES');

-- AlterTable
ALTER TABLE "mejora_continua"."configuracion_competencia" ADD COLUMN "responsable_id" UUID;

-- CreateTable
CREATE TABLE "mejora_continua"."indicacion_medicion" (
    "id" UUID NOT NULL,
    "plan_evaluacion_id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "grupo_objetivo" "mejora_continua"."GrupoObjetivo" NOT NULL,
    "instruccion" VARCHAR(1000) NOT NULL,
    "enlace_instrumento" VARCHAR(500) NOT NULL,
    "enlace_resultados" VARCHAR(500),

    CONSTRAINT "indicacion_medicion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indicacion_medicion_plan_evaluacion_id_periodo_id_grupo_objet_key" ON "mejora_continua"."indicacion_medicion"("plan_evaluacion_id", "periodo_id", "grupo_objetivo");

-- AddForeignKey
ALTER TABLE "mejora_continua"."indicacion_medicion" ADD CONSTRAINT "indicacion_medicion_plan_evaluacion_id_fkey" FOREIGN KEY ("plan_evaluacion_id") REFERENCES "mejora_continua"."planes_evaluacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deuda de 2c-B, dictaminada para este ciclo por ser el siguiente que toca el
-- esquema. `Evidencia` es la única de las cuatro tablas de aquel ciclo cuya
-- clave foránea no encabeza ningún índice: las otras tres lo obtienen gratis
-- de su UNIQUE. Afecta al DELETE CASCADE y al deleteMany que
-- `reemplazarEvidencias` ejecuta en cada guardado.
CREATE INDEX "evidencia_asignatura_evaluada_id_idx"
  ON "mejora_continua"."evidencia" ("asignatura_evaluada_id");
