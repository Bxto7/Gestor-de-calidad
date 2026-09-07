-- CreateEnum
CREATE TYPE "mejora_continua"."TipoDocumentoMedicion" AS ENUM ('PLAN_MEDICION_PDF', 'PLAN_MEDICION_EXCEL');

-- CreateEnum
CREATE TYPE "mejora_continua"."EstadoDocumentoMedicion" AS ENUM ('EN_COLA', 'GENERANDO', 'LISTO', 'FALLIDO');

-- CreateTable
CREATE TABLE "mejora_continua"."documentos_medicion" (
    "id" UUID NOT NULL,
    "plan_medicion_id" UUID NOT NULL,
    "tipo" "mejora_continua"."TipoDocumentoMedicion" NOT NULL,
    "estado" "mejora_continua"."EstadoDocumentoMedicion" NOT NULL DEFAULT 'EN_COLA',
    "nombre_archivo" VARCHAR(200),
    "tipo_mime" VARCHAR(120),
    "bytes" INTEGER,
    "ubicacion" VARCHAR(500),
    "error" TEXT,
    "solicitado_por" UUID NOT NULL,
    "solicitado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "documentos_medicion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_medicion_plan_medicion_id_solicitado_en_idx" ON "mejora_continua"."documentos_medicion"("plan_medicion_id", "solicitado_en");

-- AddForeignKey
ALTER TABLE "mejora_continua"."documentos_medicion" ADD CONSTRAINT "documentos_medicion_plan_medicion_id_fkey" FOREIGN KEY ("plan_medicion_id") REFERENCES "mejora_continua"."planes_medicion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
