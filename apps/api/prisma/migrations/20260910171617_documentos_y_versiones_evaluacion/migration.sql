-- CreateEnum
CREATE TYPE "mejora_continua"."TipoDocumentoEvaluacion" AS ENUM ('PLAN_EVALUACION_PDF', 'PLAN_EVALUACION_EXCEL');

-- CreateEnum
CREATE TYPE "mejora_continua"."EstadoDocumentoEvaluacion" AS ENUM ('EN_COLA', 'GENERANDO', 'LISTO', 'FALLIDO');

-- AlterTable
ALTER TABLE "mejora_continua"."planes_evaluacion" ADD COLUMN     "aprobado_en" TIMESTAMPTZ(6),
ADD COLUMN     "aprobado_por_id" UUID,
ADD COLUMN     "derivado_de_id" UUID;

-- CreateTable
CREATE TABLE "mejora_continua"."documentos_evaluacion" (
    "id" UUID NOT NULL,
    "plan_evaluacion_id" UUID NOT NULL,
    "tipo" "mejora_continua"."TipoDocumentoEvaluacion" NOT NULL,
    "estado" "mejora_continua"."EstadoDocumentoEvaluacion" NOT NULL DEFAULT 'EN_COLA',
    "nombre_archivo" VARCHAR(200),
    "tipo_mime" VARCHAR(120),
    "bytes" INTEGER,
    "ubicacion" VARCHAR(500),
    "error" TEXT,
    "solicitado_por" UUID NOT NULL,
    "solicitado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "documentos_evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_evaluacion_plan_evaluacion_id_solicitado_en_idx" ON "mejora_continua"."documentos_evaluacion"("plan_evaluacion_id", "solicitado_en");

-- AddForeignKey
ALTER TABLE "mejora_continua"."planes_evaluacion" ADD CONSTRAINT "planes_evaluacion_derivado_de_id_fkey" FOREIGN KEY ("derivado_de_id") REFERENCES "mejora_continua"."planes_evaluacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."documentos_evaluacion" ADD CONSTRAINT "documentos_evaluacion_plan_evaluacion_id_fkey" FOREIGN KEY ("plan_evaluacion_id") REFERENCES "mejora_continua"."planes_evaluacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
