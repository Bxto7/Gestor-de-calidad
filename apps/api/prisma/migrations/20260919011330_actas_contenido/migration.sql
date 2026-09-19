/*
  Warnings:

  - Added the required column `texto_acuerdo_cierre` to the `actas_aprobacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `texto_introduccion` to the `actas_aprobacion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Default temporal para no romper filas existentes (ver Nota del Step 3 del
-- pliego de Task 3); se retira en la misma migración justo debajo.
ALTER TABLE "mejora_continua"."actas_aprobacion" ADD COLUMN     "texto_acuerdo_cierre" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "texto_introduccion" TEXT NOT NULL DEFAULT '';

ALTER TABLE "mejora_continua"."actas_aprobacion" ALTER COLUMN "texto_acuerdo_cierre" DROP DEFAULT,
ALTER COLUMN "texto_introduccion" DROP DEFAULT;

-- CreateTable
CREATE TABLE "mejora_continua"."acciones_acta" (
    "id" UUID NOT NULL,
    "acta_id" UUID NOT NULL,
    "plan_mejora_id" UUID NOT NULL,
    "aspecto" "mejora_continua"."AspectoPlanMejora" NOT NULL,
    "incluida" BOOLEAN NOT NULL DEFAULT true,
    "porcentaje_medicion_competencia" SMALLINT,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "acciones_acta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acciones_acta_acta_id_idx" ON "mejora_continua"."acciones_acta"("acta_id");

-- CreateIndex
CREATE UNIQUE INDEX "acciones_acta_acta_id_plan_mejora_id_key" ON "mejora_continua"."acciones_acta"("acta_id", "plan_mejora_id");

-- AddForeignKey
ALTER TABLE "mejora_continua"."acciones_acta" ADD CONSTRAINT "acciones_acta_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "mejora_continua"."actas_aprobacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
