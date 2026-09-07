-- CreateTable
CREATE TABLE "mejora_continua"."configuracion_competencia" (
    "id" UUID NOT NULL,
    "plan_evaluacion_id" UUID NOT NULL,
    "competencia_id" UUID NOT NULL,
    "instrumento" VARCHAR(300),
    "frecuencia" VARCHAR(120),

    CONSTRAINT "configuracion_competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."medicion_alcanzada" (
    "id" UUID NOT NULL,
    "plan_evaluacion_id" UUID NOT NULL,
    "competencia_id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "porcentaje_alcanzado" SMALLINT,

    CONSTRAINT "medicion_alcanzada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."asignatura_evaluada" (
    "id" UUID NOT NULL,
    "medicion_alcanzada_id" UUID NOT NULL,
    "asignatura_id" UUID NOT NULL,
    "entregable" VARCHAR(300) NOT NULL,
    "docente_id" UUID,

    CONSTRAINT "asignatura_evaluada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mejora_continua"."evidencia" (
    "id" UUID NOT NULL,
    "asignatura_evaluada_id" UUID NOT NULL,
    "enlace" VARCHAR(2000) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "orden" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_competencia_plan_evaluacion_id_competencia_id_key" ON "mejora_continua"."configuracion_competencia"("plan_evaluacion_id", "competencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicion_alcanzada_plan_evaluacion_id_competencia_id_period_key" ON "mejora_continua"."medicion_alcanzada"("plan_evaluacion_id", "competencia_id", "periodo_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignatura_evaluada_medicion_alcanzada_id_asignatura_id_key" ON "mejora_continua"."asignatura_evaluada"("medicion_alcanzada_id", "asignatura_id");

-- AddForeignKey
ALTER TABLE "mejora_continua"."configuracion_competencia" ADD CONSTRAINT "configuracion_competencia_plan_evaluacion_id_fkey" FOREIGN KEY ("plan_evaluacion_id") REFERENCES "mejora_continua"."planes_evaluacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."medicion_alcanzada" ADD CONSTRAINT "medicion_alcanzada_plan_evaluacion_id_fkey" FOREIGN KEY ("plan_evaluacion_id") REFERENCES "mejora_continua"."planes_evaluacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."asignatura_evaluada" ADD CONSTRAINT "asignatura_evaluada_medicion_alcanzada_id_fkey" FOREIGN KEY ("medicion_alcanzada_id") REFERENCES "mejora_continua"."medicion_alcanzada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mejora_continua"."evidencia" ADD CONSTRAINT "evidencia_asignatura_evaluada_id_fkey" FOREIGN KEY ("asignatura_evaluada_id") REFERENCES "mejora_continua"."asignatura_evaluada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RF-PE-019 RN2: el porcentaje alcanzado va de 0 a 100. El DTO protege la
-- puerta HTTP; esto protege el dato, que es lo que acaba en un expediente de
-- acreditación. Un 150 % en un informe de acreditación no es un detalle.
ALTER TABLE "mejora_continua"."medicion_alcanzada"
  ADD CONSTRAINT "medicion_alcanzada_porcentaje_0_100"
  CHECK ("porcentaje_alcanzado" IS NULL OR ("porcentaje_alcanzado" >= 0 AND "porcentaje_alcanzado" <= 100));
