-- Trabajos de generación de documentos (RF072, RF073, RF084, RF092).
--
-- Tabla nueva: no toca nada existente, así que el orden que genera Prisma
-- vale tal cual. Los triggers de inmutabilidad de RF083 están atados a
-- `planes_estudio` y `asignaturas`, no a cualquier tabla con plan_id, así
-- que generar un documento de un plan Histórico —el caso principal— no
-- choca con ellos.

-- CreateEnum
CREATE TYPE "plan_estudios"."TipoDocumento" AS ENUM ('RESUMEN_PLAN', 'MALLA_EXCEL', 'EVIDENCIA_APROBACION', 'HISTORICO_CAMBIOS');

-- CreateEnum
CREATE TYPE "plan_estudios"."EstadoDocumento" AS ENUM ('EN_COLA', 'GENERANDO', 'LISTO', 'FALLIDO');

-- CreateTable
CREATE TABLE "plan_estudios"."documentos_generados" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "tipo" "plan_estudios"."TipoDocumento" NOT NULL,
    "estado" "plan_estudios"."EstadoDocumento" NOT NULL DEFAULT 'EN_COLA',
    "nombre_archivo" VARCHAR(200),
    "tipo_mime" VARCHAR(120),
    "bytes" INTEGER,
    "ubicacion" VARCHAR(500),
    "error" TEXT,
    "solicitado_por" UUID NOT NULL,
    "solicitado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "documentos_generados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_generados_plan_id_solicitado_en_idx" ON "plan_estudios"."documentos_generados"("plan_id", "solicitado_en");

-- AddForeignKey
ALTER TABLE "plan_estudios"."documentos_generados" ADD CONSTRAINT "documentos_generados_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

