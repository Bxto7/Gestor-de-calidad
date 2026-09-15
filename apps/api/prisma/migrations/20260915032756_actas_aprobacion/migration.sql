-- CreateEnum
CREATE TYPE "mejora_continua"."EstadoActa" AS ENUM ('BORRADOR', 'EN_REVISION', 'APROBADA', 'EMITIDA', 'HISTORICA');

-- CreateTable
CREATE TABLE "mejora_continua"."actas_aprobacion" (
    "id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "periodo_academico" VARCHAR(40) NOT NULL,
    "periodo_medicion_id" UUID,
    "titulo" VARCHAR(300) NOT NULL,
    "objetivo" TEXT NOT NULL,
    "convocada_por" VARCHAR(200) NOT NULL,
    "fecha_reunion" TIMESTAMPTZ(6) NOT NULL,
    "lugar_reunion" VARCHAR(200) NOT NULL,
    "comentario" TEXT,
    "lugar_emision" VARCHAR(200),
    "fecha_emision" TIMESTAMPTZ(6),
    "estado" "mejora_continua"."EstadoActa" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "actas_aprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."asistentes_acta" (
    "id" UUID NOT NULL,
    "acta_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,

    CONSTRAINT "asistentes_acta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actas_aprobacion_carrera_id_idx" ON "mejora_continua"."actas_aprobacion"("carrera_id");

-- CreateIndex
CREATE UNIQUE INDEX "actas_aprobacion_carrera_id_correlativo_key" ON "mejora_continua"."actas_aprobacion"("carrera_id", "correlativo");

-- CreateIndex
CREATE INDEX "asistentes_acta_acta_id_idx" ON "mejora_continua"."asistentes_acta"("acta_id");

-- AddForeignKey
ALTER TABLE "mejora_continua"."asistentes_acta" ADD CONSTRAINT "asistentes_acta_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "mejora_continua"."actas_aprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
