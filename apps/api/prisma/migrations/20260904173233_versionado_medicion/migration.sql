-- AlterTable
ALTER TABLE "mejora_continua"."planes_medicion" ADD COLUMN     "aprobado_en" TIMESTAMPTZ(6),
ADD COLUMN     "aprobado_por_id" UUID,
ADD COLUMN     "derivado_de_id" UUID;

-- AddForeignKey
ALTER TABLE "mejora_continua"."planes_medicion" ADD CONSTRAINT "planes_medicion_derivado_de_id_fkey" FOREIGN KEY ("derivado_de_id") REFERENCES "mejora_continua"."planes_medicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
