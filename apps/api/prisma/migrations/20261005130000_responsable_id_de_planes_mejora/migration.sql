-- RF-CH-045 (Bloque 6b): el responsable de un plan de mejora pasa de texto libre a
-- un docente de la carrera.
--
-- `responsable_id` es nullable y SIN clave foránea: el usuario vive en el esquema
-- `auth` (CLAUDE.md §3.2) y puede inactivarse, y el plan debe seguir mostrando a
-- quien fuera responsable. La columna de texto `responsable` se conserva como
-- nombre mostrado, así que los planes anteriores siguen legibles hasta que se
-- editen. No hay relleno: no hay forma fiable de deducir el docente de un texto libre.

-- AlterTable
ALTER TABLE "mejora_continua"."planes_mejora" ADD COLUMN     "responsable_id" UUID;
