-- CreateEnum
CREATE TYPE "mejora_continua"."TipoDocumentoMejora" AS ENUM ('PLAN_MEJORA_PDF', 'PLAN_MEJORA_EXCEL');

-- AlterTable
ALTER TABLE "mejora_continua"."planes_mejora" ADD COLUMN     "aprobado_en" TIMESTAMPTZ(6),
ADD COLUMN     "aprobado_por_id" UUID,
ADD COLUMN     "derivado_de_id" UUID,
ADD COLUMN     "version" SMALLINT NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "mejora_continua"."documentos_mejora" (
    "id" UUID NOT NULL,
    "plan_mejora_id" UUID NOT NULL,
    "tipo" "mejora_continua"."TipoDocumentoMejora" NOT NULL,
    "estado" "mejora_continua"."EstadoDocumentoMedicion" NOT NULL DEFAULT 'EN_COLA',
    "nombre_archivo" VARCHAR(200),
    "tipo_mime" VARCHAR(120),
    "bytes" INTEGER,
    "ubicacion" VARCHAR(500),
    "error" TEXT,
    "solicitado_por" UUID NOT NULL,
    "solicitado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "documentos_mejora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_mejora_plan_mejora_id_solicitado_en_idx" ON "mejora_continua"."documentos_mejora"("plan_mejora_id", "solicitado_en");

-- AddForeignKey
ALTER TABLE "mejora_continua"."planes_mejora" ADD CONSTRAINT "planes_mejora_derivado_de_id_fkey" FOREIGN KEY ("derivado_de_id") REFERENCES "mejora_continua"."planes_mejora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."documentos_mejora" ADD CONSTRAINT "documentos_mejora_plan_mejora_id_fkey" FOREIGN KEY ("plan_mejora_id") REFERENCES "mejora_continua"."planes_mejora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

