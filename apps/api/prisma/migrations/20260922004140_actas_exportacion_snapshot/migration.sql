-- CreateEnum
CREATE TYPE "mejora_continua"."TipoDocumentoActa" AS ENUM ('ACTA_PDF', 'ACTA_EXCEL');

-- AlterTable
ALTER TABLE "mejora_continua"."acciones_acta" ADD COLUMN     "codigo_snapshot" VARCHAR(80),
ADD COLUMN     "meta_competencia_snapshot" SMALLINT,
ADD COLUMN     "metas_snapshot" TEXT,
ADD COLUMN     "nombre_snapshot" VARCHAR(300),
ADD COLUMN     "plazo_snapshot" DATE,
ADD COLUMN     "recursos_snapshot" TEXT,
ADD COLUMN     "responsable_snapshot" VARCHAR(300);

-- CreateTable
CREATE TABLE "mejora_continua"."documentos_acta" (
    "id" UUID NOT NULL,
    "acta_id" UUID NOT NULL,
    "tipo" "mejora_continua"."TipoDocumentoActa" NOT NULL,
    "estado" "mejora_continua"."EstadoDocumentoMedicion" NOT NULL DEFAULT 'EN_COLA',
    "nombre_archivo" VARCHAR(200),
    "tipo_mime" VARCHAR(120),
    "bytes" INTEGER,
    "ubicacion" VARCHAR(500),
    "error" TEXT,
    "solicitado_por" UUID NOT NULL,
    "solicitado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "documentos_acta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_acta_acta_id_solicitado_en_idx" ON "mejora_continua"."documentos_acta"("acta_id", "solicitado_en");

-- AddForeignKey
ALTER TABLE "mejora_continua"."documentos_acta" ADD CONSTRAINT "documentos_acta_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "mejora_continua"."actas_aprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
