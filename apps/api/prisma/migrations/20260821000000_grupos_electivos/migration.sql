-- AlterTable
ALTER TABLE "plan_estudios"."asignaturas" ADD COLUMN     "grupo_electivo_id" UUID;

-- CreateTable
CREATE TABLE "plan_estudios"."grupos_electivos" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "codigo" VARCHAR(32) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "ciclo_id" UUID NOT NULL,
    "cantidad_a_elegir" SMALLINT NOT NULL DEFAULT 1,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grupos_electivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grupos_electivos_ciclo_id_idx" ON "plan_estudios"."grupos_electivos"("ciclo_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_electivos_plan_id_codigo_key" ON "plan_estudios"."grupos_electivos"("plan_id", "codigo");

-- AddForeignKey
ALTER TABLE "plan_estudios"."grupos_electivos" ADD CONSTRAINT "grupos_electivos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."grupos_electivos" ADD CONSTRAINT "grupos_electivos_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "plan_estudios"."ciclos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."asignaturas" ADD CONSTRAINT "asignaturas_grupo_electivo_id_fkey" FOREIGN KEY ("grupo_electivo_id") REFERENCES "plan_estudios"."grupos_electivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Reglas que el datamodel de Prisma no expresa
-- ============================================================================

-- Elegir cero asignaturas de un grupo no es un grupo; elegir más de las que
-- ofrece es imposible. Lo segundo no se puede comprobar aquí —haría falta
-- contar filas de otra tabla— y lo hace el motor de validaciones.
ALTER TABLE "plan_estudios"."grupos_electivos"
  ADD CONSTRAINT "grupos_electivos_cantidad_positiva" CHECK ("cantidad_a_elegir" > 0);

-- Una asignatura solo pertenece a un grupo si el grupo está en su mismo ciclo.
-- Sin esto, una opción del grupo del ciclo 5 podría quedar ubicada en el 9, y
-- el total de créditos del plan se calcularía sobre un ciclo que no es.
CREATE OR REPLACE FUNCTION "plan_estudios"."exigir_grupo_del_mismo_ciclo"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ciclo_del_grupo UUID;
BEGIN
  IF NEW."grupo_electivo_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT g."ciclo_id" INTO ciclo_del_grupo
    FROM "plan_estudios"."grupos_electivos" g
    WHERE g."id" = NEW."grupo_electivo_id";

  IF NEW."ciclo_id" IS DISTINCT FROM ciclo_del_grupo THEN
    RAISE EXCEPTION
      'La asignatura pertenece a un grupo de electivos de otro ciclo (RF056).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "asignaturas_grupo_del_mismo_ciclo"
  BEFORE INSERT OR UPDATE OF "grupo_electivo_id", "ciclo_id"
  ON "plan_estudios"."asignaturas"
  FOR EACH ROW
  EXECUTE FUNCTION "plan_estudios"."exigir_grupo_del_mismo_ciclo"();
