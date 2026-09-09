/*
  Warnings:

  - Added the required column `carrera_id` to the `planes_mejora` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "mejora_continua"."planes_mejora" ADD COLUMN     "carrera_id" UUID NOT NULL,
ADD COLUMN     "input" TEXT,
ADD COLUMN     "plan_evaluacion_id" UUID,
ADD COLUMN     "plan_medicion_afectado_id" UUID;

-- CreateTable
CREATE TABLE "mejora_continua"."parametro_plan_mejora" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minimo_acciones_criterio" INTEGER NOT NULL DEFAULT 1,
    "minimo_acciones_objetivo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "parametro_plan_mejora_pkey" PRIMARY KEY ("id")
);

-- RenameIndex
ALTER INDEX "mejora_continua"."indicacion_medicion_plan_evaluacion_id_periodo_id_grupo_objet_k" RENAME TO "indicacion_medicion_plan_evaluacion_id_periodo_id_grupo_obj_key";

-- RF-PJ-022/025 (decisión 7 del diseño de 2c-J-B): la fila única de
-- parámetros nace con la migración — no hay pantalla de administración en
-- este ciclo, así que el valor por defecto se siembra aquí y no en seed.ts.
INSERT INTO "mejora_continua"."parametro_plan_mejora" ("id", "minimo_acciones_criterio", "minimo_acciones_objetivo")
VALUES (1, 1, 1)
ON CONFLICT ("id") DO NOTHING;
