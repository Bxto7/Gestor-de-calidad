-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auditoria";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "plan_estudios";

-- CreateEnum
CREATE TYPE "auth"."EstadoActivacion" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "plan_estudios"."EstadoPlan" AS ENUM ('BORRADOR', 'EN_REVISION', 'APROBADO', 'VIGENTE', 'HISTORICO');

-- CreateEnum
CREATE TYPE "plan_estudios"."TipoAsignatura" AS ENUM ('GENERAL', 'TRANSVERSAL', 'ESPECIALIDAD');

-- CreateEnum
CREATE TYPE "plan_estudios"."CondicionAsignatura" AS ENUM ('OBLIGATORIA', 'ELECTIVA');

-- CreateEnum
CREATE TYPE "plan_estudios"."TipoDependencia" AS ENUM ('PRERREQUISITO', 'CORREQUISITO');

-- CreateTable
CREATE TABLE "auth"."usuarios" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre_completo" VARCHAR(200) NOT NULL,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."roles" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(64) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "es_del_sistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."permisos" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(64) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "modulo" VARCHAR(64) NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."rol_permiso" (
    "rol_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "auth"."usuario_rol" (
    "usuario_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "asignado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_rol_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "auth"."usuario_carrera" (
    "usuario_id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,

    CONSTRAINT "usuario_carrera_pkey" PRIMARY KEY ("usuario_id","carrera_id")
);

-- CreateTable
CREATE TABLE "auth"."refresh_tokens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "revocado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."facultades" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "facultades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."carreras" (
    "id" UUID NOT NULL,
    "facultad_id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "codigo" VARCHAR(16) NOT NULL,
    "duracion_anios" SMALLINT NOT NULL,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carreras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."ciclos" (
    "id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,
    "numero" SMALLINT NOT NULL,
    "creditos_min" SMALLINT,
    "creditos_max" SMALLINT,

    CONSTRAINT "ciclos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."planes_estudio" (
    "id" UUID NOT NULL,
    "carrera_id" UUID NOT NULL,
    "codigo" VARCHAR(64) NOT NULL,
    "version" SMALLINT NOT NULL,
    "estado" "plan_estudios"."EstadoPlan" NOT NULL DEFAULT 'BORRADOR',
    "duracion_anios" SMALLINT NOT NULL,
    "fecha_vigencia" TIMESTAMPTZ(6),
    "derivado_de_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planes_estudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."objetivos_educacionales" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(16) NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "objetivos_educacionales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."competencias" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(16) NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "competencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."plan_objetivo" (
    "plan_id" UUID NOT NULL,
    "objetivo_id" UUID NOT NULL,

    CONSTRAINT "plan_objetivo_pkey" PRIMARY KEY ("plan_id","objetivo_id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."plan_competencia" (
    "plan_id" UUID NOT NULL,
    "competencia_id" UUID NOT NULL,

    CONSTRAINT "plan_competencia_pkey" PRIMARY KEY ("plan_id","competencia_id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."asignaturas" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "codigo" VARCHAR(32) NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" "plan_estudios"."TipoAsignatura" NOT NULL,
    "condicion" "plan_estudios"."CondicionAsignatura" NOT NULL,
    "creditos" SMALLINT NOT NULL,
    "horas_teoricas" SMALLINT NOT NULL,
    "ciclo_id" UUID,
    "orden" SMALLINT NOT NULL DEFAULT 0,
    "estado" "auth"."EstadoActivacion" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "asignaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."asignatura_competencia" (
    "asignatura_id" UUID NOT NULL,
    "competencia_id" UUID NOT NULL,

    CONSTRAINT "asignatura_competencia_pkey" PRIMARY KEY ("asignatura_id","competencia_id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."dependencias" (
    "asignatura_id" UUID NOT NULL,
    "requiere_id" UUID NOT NULL,
    "tipo" "plan_estudios"."TipoDependencia" NOT NULL DEFAULT 'PRERREQUISITO',

    CONSTRAINT "dependencias_pkey" PRIMARY KEY ("asignatura_id","requiere_id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."eventos_aprobacion" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "accion" VARCHAR(64) NOT NULL,
    "comentario" TEXT,
    "usuario_id" UUID NOT NULL,
    "usuario_nombre" VARCHAR(200) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_aprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estudios"."justificaciones" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "codigo_regla" VARCHAR(64) NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "justificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria"."audit_log" (
    "id" UUID NOT NULL,
    "entidad" VARCHAR(64) NOT NULL,
    "entidad_id" UUID NOT NULL,
    "accion" VARCHAR(64) NOT NULL,
    "detalle" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "usuario_nombre" VARCHAR(200) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "auth"."usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "auth"."roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "auth"."permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "auth"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "auth"."refresh_tokens"("usuario_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expira_en_idx" ON "auth"."refresh_tokens"("expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "facultades_nombre_key" ON "plan_estudios"."facultades"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "carreras_codigo_key" ON "plan_estudios"."carreras"("codigo");

-- CreateIndex
CREATE INDEX "carreras_facultad_id_idx" ON "plan_estudios"."carreras"("facultad_id");

-- CreateIndex
CREATE UNIQUE INDEX "carreras_facultad_id_nombre_key" ON "plan_estudios"."carreras"("facultad_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ciclos_carrera_id_numero_key" ON "plan_estudios"."ciclos"("carrera_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "planes_estudio_codigo_key" ON "plan_estudios"."planes_estudio"("codigo");

-- CreateIndex
CREATE INDEX "planes_estudio_carrera_id_estado_idx" ON "plan_estudios"."planes_estudio"("carrera_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "planes_estudio_carrera_id_version_key" ON "plan_estudios"."planes_estudio"("carrera_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_educacionales_codigo_key" ON "plan_estudios"."objetivos_educacionales"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "competencias_codigo_key" ON "plan_estudios"."competencias"("codigo");

-- CreateIndex
CREATE INDEX "asignaturas_plan_id_ciclo_id_idx" ON "plan_estudios"."asignaturas"("plan_id", "ciclo_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignaturas_plan_id_codigo_key" ON "plan_estudios"."asignaturas"("plan_id", "codigo");

-- CreateIndex
CREATE INDEX "dependencias_requiere_id_idx" ON "plan_estudios"."dependencias"("requiere_id");

-- CreateIndex
CREATE INDEX "eventos_aprobacion_plan_id_fecha_idx" ON "plan_estudios"."eventos_aprobacion"("plan_id", "fecha");

-- CreateIndex
CREATE INDEX "justificaciones_plan_id_idx" ON "plan_estudios"."justificaciones"("plan_id");

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidad_id_fecha_idx" ON "auditoria"."audit_log"("entidad", "entidad_id", "fecha");

-- CreateIndex
CREATE INDEX "audit_log_fecha_idx" ON "auditoria"."audit_log"("fecha");

-- AddForeignKey
ALTER TABLE "auth"."rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "auth"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "auth"."permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."usuario_rol" ADD CONSTRAINT "usuario_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "auth"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."usuario_carrera" ADD CONSTRAINT "usuario_carrera_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."carreras" ADD CONSTRAINT "carreras_facultad_id_fkey" FOREIGN KEY ("facultad_id") REFERENCES "plan_estudios"."facultades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."ciclos" ADD CONSTRAINT "ciclos_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "plan_estudios"."carreras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."planes_estudio" ADD CONSTRAINT "planes_estudio_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "plan_estudios"."carreras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."planes_estudio" ADD CONSTRAINT "planes_estudio_derivado_de_id_fkey" FOREIGN KEY ("derivado_de_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."plan_objetivo" ADD CONSTRAINT "plan_objetivo_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."plan_objetivo" ADD CONSTRAINT "plan_objetivo_objetivo_id_fkey" FOREIGN KEY ("objetivo_id") REFERENCES "plan_estudios"."objetivos_educacionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."plan_competencia" ADD CONSTRAINT "plan_competencia_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."plan_competencia" ADD CONSTRAINT "plan_competencia_competencia_id_fkey" FOREIGN KEY ("competencia_id") REFERENCES "plan_estudios"."competencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."asignaturas" ADD CONSTRAINT "asignaturas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."asignaturas" ADD CONSTRAINT "asignaturas_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "plan_estudios"."ciclos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."asignatura_competencia" ADD CONSTRAINT "asignatura_competencia_asignatura_id_fkey" FOREIGN KEY ("asignatura_id") REFERENCES "plan_estudios"."asignaturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."asignatura_competencia" ADD CONSTRAINT "asignatura_competencia_competencia_id_fkey" FOREIGN KEY ("competencia_id") REFERENCES "plan_estudios"."competencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."dependencias" ADD CONSTRAINT "dependencias_asignatura_id_fkey" FOREIGN KEY ("asignatura_id") REFERENCES "plan_estudios"."asignaturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."dependencias" ADD CONSTRAINT "dependencias_requiere_id_fkey" FOREIGN KEY ("requiere_id") REFERENCES "plan_estudios"."asignaturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."eventos_aprobacion" ADD CONSTRAINT "eventos_aprobacion_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estudios"."justificaciones" ADD CONSTRAINT "justificaciones_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan_estudios"."planes_estudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Invariantes que Prisma no puede expresar
--
-- Todo lo de abajo es SQL escrito a mano. Prisma no cubre índices parciales,
-- CHECK constraints ni triggers, y estos son precisamente los invariantes que
-- CLAUDE.md §3.3 marca como críticos. Dejarlos solo en el dominio significaría
-- que un bug, un script de mantenimiento o una consulta manual pueden corromper
-- los datos de acreditación sin que nada lo impida.
--
-- IMPORTANTE: si se regenera esta migración desde el esquema, este bloque se
-- pierde. Debe conservarse o volverse a añadir.
-- ============================================================================

-- ── 1. Una sola versión Vigente por carrera ─────────────────────────────────
-- §3.3 lo llama "invariante que debe protegerse a nivel de dominio, no solo de
-- UI", y RF090 lo califica de crítico para la integridad del módulo. Un índice
-- único parcial lo hace imposible incluso bajo concurrencia: dos transacciones
-- simultáneas que intenten activar dos versiones chocarán aquí.
CREATE UNIQUE INDEX "planes_una_vigente_por_carrera"
  ON "plan_estudios"."planes_estudio" ("carrera_id")
  WHERE "estado" = 'VIGENTE';

-- ── 2. Unicidad de nombres ignorando mayúsculas, espacios y acentos ─────────
-- RF006 RN1 y RF015. El `UNIQUE` que genera Prisma solo cubre la coincidencia
-- exacta, así que "Ingeniería" e "Ingenieria" pasarían como facultades
-- distintas.
--
-- La expresión replica a propósito lo que hace `normalizarParaUnicidad` en el
-- dominio, incluida la decisión sobre la eñe: `translate` enumera solo las
-- vocales acentuadas y la diéresis, dejando la Ñ intacta. La eñe es una letra
-- del alfabeto español, no una "n" con tilde; colapsarla haría que "Campaña" y
-- "Campana" se rechazaran como duplicados.
--
-- No se usa la extensión `unaccent` justamente por eso: despoja también la eñe.
--
-- Esta lógica vive en dos sitios (aquí y en el dominio) y puede desincronizarse.
-- Es un coste aceptado: sin el índice, dos peticiones concurrentes podrían
-- insertar ambas variantes tras pasar cada una la validación de aplicación.
CREATE UNIQUE INDEX "facultades_nombre_normalizado"
  ON "plan_estudios"."facultades" (
    lower(translate(regexp_replace(btrim("nombre"), '\s+', ' ', 'g'),
                    'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU'))
  );

CREATE UNIQUE INDEX "carreras_nombre_normalizado_por_facultad"
  ON "plan_estudios"."carreras" (
    "facultad_id",
    lower(translate(regexp_replace(btrim("nombre"), '\s+', ' ', 'g'),
                    'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU'))
  );

CREATE UNIQUE INDEX "carreras_codigo_normalizado"
  ON "plan_estudios"."carreras" (upper(btrim("codigo")));

-- ── 3. Rangos numéricos ─────────────────────────────────────────────────────
-- Las reglas de negocio que son verificables con una expresión escalar se
-- imponen aquí, donde no dependen de que la capa de aplicación se acuerde.
ALTER TABLE "plan_estudios"."asignaturas"
  -- RF054 RN1: los créditos deben ser un valor mayor a cero.
  ADD CONSTRAINT "asignaturas_creditos_positivos" CHECK ("creditos" > 0),
  -- RF055 RN1: las horas teóricas deben ser no negativas.
  ADD CONSTRAINT "asignaturas_horas_no_negativas" CHECK ("horas_teoricas" >= 0);

ALTER TABLE "plan_estudios"."carreras"
  -- RF011 RN1: el número de ciclos debe ser un entero positivo.
  ADD CONSTRAINT "carreras_duracion_positiva" CHECK ("duracion_anios" > 0);

ALTER TABLE "plan_estudios"."ciclos"
  -- RF096: la numeración arranca en 1.
  ADD CONSTRAINT "ciclos_numero_positivo" CHECK ("numero" > 0),
  -- RF064: si se configura un rango, el mínimo no puede superar al máximo.
  ADD CONSTRAINT "ciclos_rango_coherente"
    CHECK ("creditos_min" IS NULL OR "creditos_max" IS NULL OR "creditos_min" <= "creditos_max");

ALTER TABLE "plan_estudios"."planes_estudio"
  ADD CONSTRAINT "planes_version_positiva" CHECK ("version" > 0),
  -- RF075: un plan no puede derivarse de sí mismo.
  ADD CONSTRAINT "planes_derivacion_no_circular"
    CHECK ("derivado_de_id" IS NULL OR "derivado_de_id" <> "id");

ALTER TABLE "plan_estudios"."dependencias"
  -- Caso trivial del grafo sin ciclos: una asignatura no es prerrequisito de sí
  -- misma. Los ciclos de longitud mayor exigen recorrer el grafo y los valida
  -- el MotorDeValidaciones (RF097).
  ADD CONSTRAINT "dependencias_sin_autorreferencia"
    CHECK ("asignatura_id" <> "requiere_id");

-- ── 4. Versiones Histórico inmutables ───────────────────────────────────────
-- §3.3 y RF083: "Ninguna versión Histórica puede ser editada, bajo ningún rol".
-- Un trigger es la única forma de expresar "inmutable una vez alcanzado este
-- estado", porque depende del valor anterior de la fila.
--
-- Se permite la transición Vigente → Histórico: ahí OLD.estado todavía no es
-- HISTORICO. Lo que se bloquea es cualquier escritura sobre una fila que ya
-- estaba en ese estado.
CREATE OR REPLACE FUNCTION "plan_estudios"."impedir_modificar_historico"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'El plan % está en estado Histórico y es inmutable (RF083).',
    OLD."codigo"
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "planes_historico_inmutable"
  BEFORE UPDATE OR DELETE ON "plan_estudios"."planes_estudio"
  FOR EACH ROW
  WHEN (OLD."estado" = 'HISTORICO')
  EXECUTE FUNCTION "plan_estudios"."impedir_modificar_historico"();

-- La malla de un plan histórico es igual de inmutable: dejar editar sus
-- asignaturas permitiría reescribir el contenido sin tocar la cabecera.
CREATE OR REPLACE FUNCTION "plan_estudios"."impedir_modificar_malla_historica"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  estado_plan "plan_estudios"."EstadoPlan";
BEGIN
  SELECT p."estado" INTO estado_plan
    FROM "plan_estudios"."planes_estudio" p
    WHERE p."id" = COALESCE(NEW."plan_id", OLD."plan_id");

  IF estado_plan = 'HISTORICO' THEN
    RAISE EXCEPTION
      'La asignatura pertenece a un plan en estado Histórico y es inmutable (RF083).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "asignaturas_malla_historica_inmutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "plan_estudios"."asignaturas"
  FOR EACH ROW
  EXECUTE FUNCTION "plan_estudios"."impedir_modificar_malla_historica"();

-- ── 5. Bitácora append-only ─────────────────────────────────────────────────
-- §4.3 pide explícitamente una tabla "sin updates/deletes permitidos a nivel de
-- rol de BD", para reforzar la inmutabilidad en infraestructura y no solo en el
-- código. El trigger cubre a cualquier rol, incluido el propietario; el REVOKE
-- se aplica además al rol de la aplicación cuando exista.
CREATE OR REPLACE FUNCTION "auditoria"."impedir_reescribir_bitacora"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'La bitácora de auditoría es append-only: no admite UPDATE ni DELETE (§4.3).'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "auditoria"."audit_log"
  FOR EACH ROW
  EXECUTE FUNCTION "auditoria"."impedir_reescribir_bitacora"();

-- El REVOKE es la segunda capa. Se aplica solo si el rol existe, para que la
-- migración funcione igual en local (donde suele usarse el superusuario) y en
-- el VPS, donde la aplicación corre con un rol propio y sin privilegios.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgc_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "auditoria"."audit_log" FROM "sgc_app";
  END IF;
END;
$$;
