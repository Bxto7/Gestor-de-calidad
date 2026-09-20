-- AlterTable
ALTER TABLE "mejora_continua"."actas_aprobacion" ADD COLUMN     "aprobado_por_id" UUID,
ADD COLUMN     "aprobado_en" TIMESTAMPTZ(6);
