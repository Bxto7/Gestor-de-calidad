-- CreateEnum
CREATE TYPE "mejora_continua"."AspectoPlanMejora" AS ENUM ('CRITERIO_ACREDITACION', 'OBJETIVO_EDUCACIONAL', 'COMPETENCIA');

-- CreateEnum
CREATE TYPE "mejora_continua"."EstadoImplementacionMejora" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO');

-- CreateTable
CREATE TABLE "mejora_continua"."planes_mejora" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "aspecto" "mejora_continua"."AspectoPlanMejora" NOT NULL,
    "criterio_acreditacion_id" UUID,
    "objetivo_educacional_id" UUID,
    "competencia_id" UUID,
    "periodo_id" UUID,
    "estado" "mejora_continua"."EstadoMedicion" NOT NULL DEFAULT 'BORRADOR',
    "estado_implementacion" "mejora_continua"."EstadoImplementacionMejora" NOT NULL DEFAULT 'PENDIENTE',
    "nombre" VARCHAR(300) NOT NULL,
    "causa_raiz" TEXT NOT NULL,
    "justificacion" TEXT NOT NULL,
    "plazo" DATE NOT NULL,
    "recursos" TEXT NOT NULL,
    "metas" TEXT NOT NULL,
    "responsable" VARCHAR(300) NOT NULL,
    "logro_meta" TEXT,
    "impacto" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planes_mejora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."evidencia_plan_mejora" (
    "id" UUID NOT NULL,
    "plan_mejora_id" UUID NOT NULL,
    "referencia" VARCHAR(2000) NOT NULL,
    "nombre_archivo" VARCHAR(300),
    "subido_por" UUID NOT NULL,
    "subido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencia_plan_mejora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- RF-PJ-003 RN2: el alta calcula el ámbito del correlativo consultando por
-- aspecto + elemento (criterio, objetivo, o periodo para competencias).
CREATE INDEX "planes_mejora_aspecto_criterio_acreditacion_id_idx" ON "mejora_continua"."planes_mejora"("aspecto", "criterio_acreditacion_id");

-- CreateIndex
CREATE INDEX "planes_mejora_aspecto_objetivo_educacional_id_idx" ON "mejora_continua"."planes_mejora"("aspecto", "objetivo_educacional_id");

-- CreateIndex
CREATE INDEX "planes_mejora_aspecto_periodo_id_idx" ON "mejora_continua"."planes_mejora"("aspecto", "periodo_id");

-- CreateIndex
-- A diferencia de `evidencia` (evaluación), que se quedó sin este índice
-- hasta 2c-C: se declara desde el primer commit de esta tabla.
CREATE INDEX "evidencia_plan_mejora_plan_mejora_id_idx" ON "mejora_continua"."evidencia_plan_mejora"("plan_mejora_id");

-- AddForeignKey
ALTER TABLE "mejora_continua"."evidencia_plan_mejora" ADD CONSTRAINT "evidencia_plan_mejora_plan_mejora_id_fkey" FOREIGN KEY ("plan_mejora_id") REFERENCES "mejora_continua"."planes_mejora"("id") ON DELETE CASCADE ON UPDATE CASCADE;
