-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "mejora_continua";

-- CreateEnum
CREATE TYPE "mejora_continua"."TipoMedicion" AS ENUM ('DIRECTA', 'INDIRECTA');

-- CreateEnum
CREATE TYPE "mejora_continua"."EstadoMedicion" AS ENUM ('BORRADOR', 'EN_REVISION', 'APROBADO', 'VIGENTE', 'HISTORICO');

-- CreateTable
CREATE TABLE "mejora_continua"."planes_medicion" (
    "id" UUID NOT NULL,
    "plan_estudios_id" UUID NOT NULL,
    "tipo" "mejora_continua"."TipoMedicion" NOT NULL,
    "codigo" VARCHAR(64) NOT NULL,
    "version" SMALLINT NOT NULL DEFAULT 1,
    "meta" DECIMAL(4,3) NOT NULL,
    "estado" "mejora_continua"."EstadoMedicion" NOT NULL DEFAULT 'BORRADOR',
    "periodo_inicio_anio" SMALLINT,
    "periodo_inicio_mitad" SMALLINT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planes_medicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."periodos_medicion" (
    "id" UUID NOT NULL,
    "plan_medicion_id" UUID NOT NULL,
    "etiqueta" VARCHAR(16) NOT NULL,
    "orden" SMALLINT NOT NULL,
    "fecha_cierre" DATE,

    CONSTRAINT "periodos_medicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."competencias_del_plan" (
    "plan_medicion_id" UUID NOT NULL,
    "competencia_id" UUID NOT NULL,

    CONSTRAINT "competencias_del_plan_pkey" PRIMARY KEY ("plan_medicion_id","competencia_id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."programacion_medicion" (
    "plan_medicion_id" UUID NOT NULL,
    "competencia_id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "realizada" BOOLEAN NOT NULL DEFAULT false,
    "realizada_en" TIMESTAMPTZ(6),
    "realizada_por_id" UUID,

    CONSTRAINT "programacion_medicion_pkey" PRIMARY KEY ("plan_medicion_id","competencia_id","periodo_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_medicion_codigo_key" ON "mejora_continua"."planes_medicion"("codigo");

-- CreateIndex
CREATE INDEX "planes_medicion_plan_estudios_id_tipo_idx" ON "mejora_continua"."planes_medicion"("plan_estudios_id", "tipo");

-- CreateIndex
CREATE INDEX "periodos_medicion_plan_medicion_id_orden_idx" ON "mejora_continua"."periodos_medicion"("plan_medicion_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_medicion_plan_medicion_id_etiqueta_key" ON "mejora_continua"."periodos_medicion"("plan_medicion_id", "etiqueta");

-- CreateIndex
CREATE INDEX "programacion_medicion_periodo_id_idx" ON "mejora_continua"."programacion_medicion"("periodo_id");

-- AddForeignKey
ALTER TABLE "mejora_continua"."periodos_medicion" ADD CONSTRAINT "periodos_medicion_plan_medicion_id_fkey" FOREIGN KEY ("plan_medicion_id") REFERENCES "mejora_continua"."planes_medicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."competencias_del_plan" ADD CONSTRAINT "competencias_del_plan_plan_medicion_id_fkey" FOREIGN KEY ("plan_medicion_id") REFERENCES "mejora_continua"."planes_medicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."programacion_medicion" ADD CONSTRAINT "programacion_medicion_plan_medicion_id_fkey" FOREIGN KEY ("plan_medicion_id") REFERENCES "mejora_continua"."planes_medicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."programacion_medicion" ADD CONSTRAINT "programacion_medicion_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "mejora_continua"."periodos_medicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RF-PM-041 RN1: un único plan Vigente por combinación de plan de estudios y
-- tipo. Índice parcial y no @@unique, que impediría también tener dos
-- Borradores del mismo tipo mientras se prepara el relevo. Mismo mecanismo que
-- `planes_una_vigente_por_carrera` del esquema inicial.
CREATE UNIQUE INDEX "medicion_una_vigente_por_plan_y_tipo"
  ON "mejora_continua"."planes_medicion" ("plan_estudios_id", "tipo")
  WHERE "estado" = 'VIGENTE';
