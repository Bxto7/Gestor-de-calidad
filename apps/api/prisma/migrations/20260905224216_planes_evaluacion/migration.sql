-- CreateTable
CREATE TABLE "mejora_continua"."planes_evaluacion" (
    "id" UUID NOT NULL,
    "plan_medicion_id" UUID NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "estado" "mejora_continua"."EstadoMedicion" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planes_evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_evaluacion_codigo_key" ON "mejora_continua"."planes_evaluacion"("codigo");

-- CreateIndex
CREATE INDEX "planes_evaluacion_plan_medicion_id_idx" ON "mejora_continua"."planes_evaluacion"("plan_medicion_id");

-- AddForeignKey
ALTER TABLE "mejora_continua"."planes_evaluacion" ADD CONSTRAINT "planes_evaluacion_plan_medicion_id_fkey" FOREIGN KEY ("plan_medicion_id") REFERENCES "mejora_continua"."planes_medicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RF-PE-044 RN1: solo puede existir un plan de evaluación Vigente por plan de
-- medición. En la base y no solo en el dominio: dos peticiones simultáneas
-- pasarían las dos la comprobación de la aplicación y dejarían dos vigentes.
CREATE UNIQUE INDEX "evaluacion_una_vigente_por_medicion"
  ON "mejora_continua"."planes_evaluacion" ("plan_medicion_id")
  WHERE "estado" = 'VIGENTE';
