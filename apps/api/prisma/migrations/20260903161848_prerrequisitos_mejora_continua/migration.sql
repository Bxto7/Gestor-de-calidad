-- AlterTable
ALTER TABLE "plan_estudios"."atributos_graduado" ADD COLUMN     "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO';

-- CreateTable
CREATE TABLE "plan_estudios"."plan_atributo" (
    "plan_id" UUID NOT NULL,
    "atributo_id" UUID NOT NULL,

    CONSTRAINT "plan_atributo_pkey" PRIMARY KEY ("plan_id","atributo_id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."criterios_acreditacion" (
    "id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,
    "codigo" VARCHAR(16) NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "criterios_acreditacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_atributo_atributo_id_idx" ON "plan_estudios"."plan_atributo"("atributo_id");

-- CreateIndex
CREATE INDEX "criterios_acreditacion_carrera_id_idx" ON "plan_estudios"."criterios_acreditacion"("carrera_id");

-- CreateIndex
CREATE UNIQUE INDEX "criterios_acreditacion_carrera_id_codigo_key" ON "plan_estudios"."criterios_acreditacion"("carrera_id", "codigo");

-- AddForeignKey
ALTER TABLE "plan_estudios"."plan_atributo" ADD CONSTRAINT "plan_atributo_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."plan_atributo" ADD CONSTRAINT "plan_atributo_atributo_id_fkey" FOREIGN KEY ("atributo_id") REFERENCES "plan_estudios"."atributos_graduado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."criterios_acreditacion" ADD CONSTRAINT "criterios_acreditacion_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "plan_estudios"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
