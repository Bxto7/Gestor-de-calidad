-- AlterTable
ALTER TABLE "plan_estudios"."competencias" ADD COLUMN     "atributo_graduado_id" UUID;

-- CreateTable
CREATE TABLE "plan_estudios"."atributos_graduado" (
    "id" UUID NOT NULL,
    "marco" VARCHAR(32) NOT NULL DEFAULT 'ICACIT',
    "codigo" VARCHAR(16) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "orden" SMALLINT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "atributos_graduado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "atributos_graduado_marco_codigo_key" ON "plan_estudios"."atributos_graduado"("marco", "codigo");

-- AddForeignKey
ALTER TABLE "plan_estudios"."competencias" ADD CONSTRAINT "competencias_atributo_graduado_id_fkey" FOREIGN KEY ("atributo_graduado_id") REFERENCES "plan_estudios"."atributos_graduado"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Un atributo sin orden no se puede listar como lo hace el estándar, y el orden
-- del marco empieza en 1.
ALTER TABLE "plan_estudios"."atributos_graduado"
  ADD CONSTRAINT "atributos_graduado_orden_positivo" CHECK ("orden" > 0);
