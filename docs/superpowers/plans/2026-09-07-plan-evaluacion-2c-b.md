# Plan de Evaluación · ciclo 2c-B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que para cada cruce competencia-periodo que el plan de medición programó se pueda registrar el instrumento, la frecuencia, las asignaturas con su entregable y su docente, el porcentaje alcanzado y los enlaces de evidencia.

**Architecture:** Tres niveles de dato y tres tablas más la de evidencias, porque cada regla de negocio del documento se convierte así en un índice único en vez de en una comprobación que hay que recordar. La frontera de estados —qué se congela al aprobar y qué se sigue registrando— se codifica **partiendo los endpoints**: los de configuración exigen Borrador, los dos de seguimiento aceptan Vigente.

**Tech Stack:** NestJS 11 · Prisma 7 (multiSchema, esquema `mejora_continua`) · PostgreSQL 16 · React 18 + Vite + `@tanstack/react-query` · Vitest · Playwright + axe-core

**Spec:** `docs/superpowers/specs/2026-09-07-plan-evaluacion-2c-b-design.md`

## Global Constraints

- **Alcance:** RF-PE-006, RF-PE-007 y RF-PE-013 a RF-PE-021 (11 requisitos).
- **La frontera de estados**, exacta:

  | | Borrador | Vigente | Aprobado · En revisión · Histórico |
  |---|---|---|---|
  | instrumento, frecuencia | ✅ | ❌ | ❌ |
  | asignaturas, entregable, docente | ✅ | ❌ | ❌ |
  | porcentaje alcanzado | ✅ | ✅ | ❌ |
  | evidencias | ✅ | ✅ | ❌ |

- **RF-PE-019 RN2:** el porcentaje va de 0 a 100, entero. `CHECK` en la migración **y** validación en el DTO.
- **RF-PE-017 RN1:** el entregable es obligatorio — `NOT NULL`, no «obligatorio en el formulario».
- **RF-PE-013 RN1:** el instrumento es único por competencia, no varía por periodo.
- **RF-PE-019 RN1:** el porcentaje es un único valor por competencia y periodo, **no por asignatura**.
- **RF-PE-012:** solo se configura donde la matriz del plan de medición base programó ese cruce.
- **Nada se copia del plan de medición.** Competencias, periodos y matriz se leen por `RepositorioPlanMedicionPort` en cada consulta, como hizo 2c-A.
- **Aislamiento (CLAUDE.md §3.2):** `mejora-continua` solo importa de `plan-estudios` el archivo `ports/contenido-curricular.port.js`, y de `auth` solo `ports/authorization.port.js` y `ports/directorio-usuarios.port.js`. Lo vigila `aislamiento.spec.ts`, que ya escanea los dos submódulos.
- **El dominio no importa NestJS ni Prisma. La aplicación no importa Prisma.**
- **Los casos de uso son clases planas, sin `@Injectable`**, cableadas por fábrica en `app.module.ts`.
- **Toda mutación relevante emite su evento de auditoría y lo cubre una prueba** (CLAUDE.md §6.6).
- **Si la tarea toca UI, entra en `tests/e2e/specs/accesibilidad.spec.ts`** — también §6.6.
- **Cada prueba nueva se comprueba por mutación:** se revierte el comportamiento y se confirma que la prueba se pone en rojo. Esa práctica ya destapó tres pruebas vacuas en los ciclos anteriores.

**Cifras de partida (deben seguir en verde):** 743 unitarias en `apps/api`, 246 de integración, 191 en `apps/web`, 29 E2E.

**Comandos:**

```bash
# apps/api
npm test && npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration

# apps/web
npm test && npm run typecheck && npm run lint && npm run format:check && npm run build

# tests/e2e — la API COMPILADA, nunca con tsx: esbuild no emite
# emitDecoratorMetadata y Nest construye vacías las clases con @Injectable.
# Antes de arrancar, comprueba que Postgres y Redis están arriba:
#   docker start sgc_postgres sgc_redis
cd apps/api && npm run build && THROTTLE_LIMIT=10000 node dist/main.js &
cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

---

### Task 1: Los dos puertos ganan lo que falta

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/ports/contenido-curricular.port.ts`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.ts`
- Modify: `apps/api/src/modules/auth/application/ports/directorio-usuarios.port.ts`
- Modify: `apps/api/src/modules/auth/infrastructure/directorio-usuarios.adapter.ts`
- Test: `apps/api/test/integration/puertos-2c-b.int.spec.ts` (crear)

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
/** En contenido-curricular.port.ts */
export interface AsignaturaBase {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  /** Para agrupar el desplegable: con 74 asignaturas, sin ciclo es inservible. */
  readonly cicloNumero: number | null;
  readonly activa: boolean;
}

export interface ContenidoCurricularPort {
  // …lo que ya tenía…
  /** RF-PE-016: las asignaturas sobre las que se puede evaluar. */
  asignaturasDelPlan(planEstudiosId: string): Promise<AsignaturaBase[]>;
}

/** En directorio-usuarios.port.ts */
export interface DirectorioDeUsuariosPort {
  nombresDe(ids: readonly string[]): Promise<Map<string, string>>;
  /** RF-PE-018: cuentas activas con ese rol, para elegir responsable. */
  porRol(codigoRol: string): Promise<{ id: string; nombre: string }[]>;
}
```

Las tareas 4, 5 y 6 los consumen.

- [ ] **Step 1: Escribir las pruebas de integración en rojo**

`apps/api/test/integration/puertos-2c-b.int.spec.ts`. Copia el `beforeEach` de `plan-evaluacion.int.spec.ts` —los TRUNCATE, la facultad, la carrera y el plan de estudios— y añade `plan_estudios.asignaturas` y `plan_estudios.ciclos` a la lista de tablas que se vacían.

```ts
/**
 * Los dos puertos que 2c-B amplía, contra la base real.
 *
 * Se prueban aquí y no con dobles porque lo que puede fallar es la consulta:
 * que el filtro por plan de estudios no filtre, que el rol no case, o que un
 * usuario inactivo se cuele en una lista de candidatos.
 */

describe('RF-PE-016 — las asignaturas del plan de estudios', () => {
  it('devuelve las del plan pedido y ninguna más', async () => {
    const otroPlan = await prisma.planEstudios.create({
      data: { carreraId, codigo: 'PE-OTRO-v1', version: 1, estado: 'VIGENTE', duracionAnios: 5 },
    });
    await crearAsignatura(planEstudiosId, 'ASUC001', 'Cálculo I');
    await crearAsignatura(otroPlan.id, 'ASUC999', 'De otro plan');

    const asignaturas = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(asignaturas.map((a) => a.codigo)).toEqual(['ASUC001']);
  });

  it('trae el número de ciclo, para poder agrupar el desplegable', async () => {
    const ciclo = await prisma.ciclo.create({ data: { carreraId, numero: 3, nombre: 'Ciclo 3' } });
    await crearAsignatura(planEstudiosId, 'ASUC002', 'Física', ciclo.id);

    const [a] = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(a?.cicloNumero).toBe(3);
  });

  it('una asignatura sin ciclo no rompe: su ciclo es null', async () => {
    // RF068 admite asignaturas sin ciclo asignado todavía; son las que la
    // alerta de consistencia señala, no un caso imposible.
    await crearAsignatura(planEstudiosId, 'ASUC003', 'Sin ciclo');

    const [a] = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(a?.cicloNumero).toBeNull();
  });

  it('las inactivas se devuelven marcadas, no escondidas', async () => {
    // Esconderlas dejaría sin explicación una asignatura que ya está asociada
    // a una competencia y de pronto desaparece del listado.
    await crearAsignatura(planEstudiosId, 'ASUC004', 'Retirada', null, 'INACTIVO');

    const [a] = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(a?.activa).toBe(false);
  });
});

describe('RF-PE-018 — los usuarios de un rol', () => {
  it('devuelve solo los del rol pedido', async () => {
    const docente = await crearUsuario('docente@sgc.local', 'Ana Docente', 'DOCENTE');
    await crearUsuario('otro@sgc.local', 'Otro Alguien', 'COORDINADOR_ACADEMICO');

    const encontrados = await directorio.porRol('DOCENTE');

    expect(encontrados.map((u) => u.id)).toEqual([docente.id]);
    expect(encontrados[0]?.nombre).toBe('Ana Docente');
  });

  it('los inactivos no salen: no se puede responsabilizar a una cuenta apagada', async () => {
    await crearUsuario('baja@sgc.local', 'De baja', 'DOCENTE', 'INACTIVO');

    expect(await directorio.porRol('DOCENTE')).toEqual([]);
  });

  it('un rol que no existe devuelve lista vacía, no una excepción', async () => {
    expect(await directorio.porRol('NO_EXISTE')).toEqual([]);
  });
});
```

Con estos ayudantes en el ámbito del archivo:

```ts
async function crearAsignatura(
  planId: string,
  codigo: string,
  nombre: string,
  cicloId: string | null = null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  return prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre,
      descripcion: 'Sumilla pendiente.',
      tipo: 'ESPECIALIDAD',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      horasTeoricas: 2,
      cicloId,
      estado,
    },
  });
}

async function crearUsuario(
  email: string,
  nombreCompleto: string,
  codigoRol: string,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto,
      passwordHash: 'x',
      estado,
      ...(rol ? { roles: { create: { rolId: rol.id } } } : {}),
    },
  });
}
```

**Los roles vienen del seed**, así que la base de pruebas tiene que estar sembrada. Si `prisma.rol.findUnique` devuelve `null` para `DOCENTE`, ejecuta `npm run db:seed` contra la base de pruebas antes de seguir.

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/puertos-2c-b.int.spec.ts
```

Expected: FAIL — `asignaturasDelPlan` y `porRol` no existen.

- [ ] **Step 3: Ampliar `ContenidoCurricularPort` y su adaptador**

En el puerto, `AsignaturaBase` y el método, con esta cabecera:

```ts
/** Asignatura del plan, tal como la necesita quien evalúa (RF-PE-016). */
export interface AsignaturaBase {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  /**
   * Para agrupar el desplegable. Con 74 asignaturas, una lista plana obliga a
   * buscar por nombre; agrupada por ciclo se encuentra a la primera.
   */
  readonly cicloNumero: number | null;
  /**
   * Las inactivas se devuelven marcadas y no escondidas: una asignatura ya
   * asociada a una competencia que de pronto desapareciera del listado no
   * tendría explicación en pantalla.
   */
  readonly activa: boolean;
}
```

En `contenido-curricular.adapter.ts`:

```ts
  async asignaturasDelPlan(planEstudiosId: string): Promise<AsignaturaBase[]> {
    const filas = await this.prisma.asignatura.findMany({
      where: { planId: planEstudiosId },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        estado: true,
        ciclo: { select: { numero: true } },
      },
      orderBy: [{ ciclo: { numero: 'asc' } }, { codigo: 'asc' }],
    });

    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      cicloNumero: f.ciclo?.numero ?? null,
      activa: f.estado === 'ACTIVO',
    }));
  }
```

- [ ] **Step 4: Ampliar `DirectorioDeUsuariosPort` y su adaptador**

En el puerto:

```ts
  /**
   * Cuentas **activas** con ese rol, para elegir un responsable.
   *
   * Las inactivas no salen: no se puede responsabilizar de una evaluación a una
   * cuenta apagada. Las que ya estén guardadas como responsables siguen
   * resolviéndose por `nombresDe`, que no filtra por estado — el registro
   * histórico se conserva aunque la persona ya no esté.
   */
  porRol(codigoRol: string): Promise<{ id: string; nombre: string }[]>;
```

En el adaptador:

```ts
  async porRol(codigoRol: string): Promise<{ id: string; nombre: string }[]> {
    const filas = await this.prisma.usuario.findMany({
      where: { estado: 'ACTIVO', roles: { some: { rol: { codigo: codigoRol } } } },
      select: { id: true, nombreCompleto: true },
      orderBy: { nombreCompleto: 'asc' },
    });
    return filas.map((f) => ({ id: f.id, nombre: f.nombreCompleto }));
  }
```

- [ ] **Step 5: Verde y comprobación por mutación**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm test && npm run typecheck && npm run lint && npm run format:check
```

Expected: 743 unitarias, 253 de integración (246 + tus 7).

Mutaciones, una a una y restaurando entre ellas:

| Mutación | Prueba que debe fallar |
|---|---|
| Quitar `where: { planId: planEstudiosId }` de `asignaturasDelPlan` | «devuelve las del plan pedido y ninguna más» |
| Quitar `estado: 'ACTIVO'` de `porRol` | «los inactivos no salen» |

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "Los puertos aprenden a listar asignaturas y usuarios por rol

RF-PE-016 necesita las asignaturas del plan de estudios base y RF-PE-018 un
docente responsable. Los dos puertos ya existían: ninguna frontera nueva.

Las asignaturas inactivas se devuelven marcadas y no escondidas — una que ya
esté asociada y desaparezca del listado no tendría explicación—, y los usuarios
inactivos sí se filtran: no se responsabiliza a una cuenta apagada."
```

---

### Task 2: Las cuatro tablas

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_configuracion_evaluacion/migration.sql`
- Test: `apps/api/test/integration/configuracion-evaluacion.int.spec.ts` (crear)

**Interfaces:**
- Consumes: el modelo `PlanEvaluacion` de 2c-A.
- Produces: los modelos `ConfiguracionCompetencia`, `MedicionAlcanzada`, `AsignaturaEvaluada` y `Evidencia`. La Task 3 los consume.

- [ ] **Step 1: Añadir los cuatro modelos**

Copia los cuatro bloques `model` de la §2 de la spec **literalmente**, con sus comentarios. En `model PlanEvaluacion`, añade las relaciones inversas:

```prisma
  configuracion ConfiguracionCompetencia[]
  mediciones    MedicionAlcanzada[]
```

- [ ] **Step 2: Generar la migración**

```bash
cd apps/api
npx prisma format && npx prisma validate
npx prisma migrate dev --name configuracion_evaluacion
npx prisma generate
```

`prisma generate` no es opcional: sin él el cliente no conoce los modelos nuevos, y el error que da no menciona que falte regenerar.

**Si la CLI de Prisma 7 bloquea algún comando** pidiendo `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, no lo fuerces: aplica la migración con `npx prisma migrate deploy`, que no está bloqueado.

- [ ] **Step 3: Añadir el `CHECK` del porcentaje a mano**

Prisma no expresa `CHECK`. Abre el `migration.sql` recién creado y añade al final:

```sql
-- RF-PE-019 RN2: el porcentaje alcanzado va de 0 a 100. El DTO protege la
-- puerta HTTP; esto protege el dato, que es lo que acaba en un expediente de
-- acreditación. Un 150 % en un informe de acreditación no es un detalle.
ALTER TABLE "mejora_continua"."medicion_alcanzada"
  ADD CONSTRAINT "medicion_alcanzada_porcentaje_0_100"
  CHECK ("porcentaje_alcanzado" IS NULL OR ("porcentaje_alcanzado" >= 0 AND "porcentaje_alcanzado" <= 100));
```

Aplícalo a la base de desarrollo con `npx prisma migrate deploy`.

- [ ] **Step 4: Escribir las pruebas de integración en rojo**

`apps/api/test/integration/configuracion-evaluacion.int.spec.ts`. Mismo `beforeEach` que `plan-evaluacion.int.spec.ts`, añadiendo las cuatro tablas nuevas **las primeras** en el TRUNCATE:

```ts
/**
 * Lo que la base garantiza de la configuración de evaluación (§6.4).
 *
 * Cuatro invariantes que con dobles no se pueden comprobar: que el instrumento
 * sea uno por competencia, que el porcentaje sea uno por cruce, que una
 * asignatura no se asocie dos veces al mismo cruce, y que un porcentaje fuera
 * de rango lo rechace PostgreSQL y no solo el DTO.
 */

describe('RF-PE-013 RN1 — un instrumento por competencia', () => {
  it('rechaza la segunda configuración de la misma competencia', async () => {
    const plan = await crearEvaluacion();
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });

    await expect(
      prisma.configuracionCompetencia.create({
        data: { planEvaluacionId: plan.id, competenciaId: CMP1, instrumento: 'Otra' },
      }),
    ).rejects.toThrow();
  });

  it('pero la misma competencia en otro plan de evaluación sí', async () => {
    const uno = await crearEvaluacion('EV-1');
    const otro = await crearEvaluacion('EV-2');
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: uno.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: otro.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });

    expect(await prisma.configuracionCompetencia.count()).toBe(2);
  });
});

describe('RF-PE-019 — el porcentaje alcanzado', () => {
  it('es uno por competencia y periodo', async () => {
    const plan = await crearEvaluacion();
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
    });

    await expect(
      prisma.medicionAlcanzada.create({
        data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
      }),
    ).rejects.toThrow();
  });

  it('el CHECK rechaza 101 y −1, no solo el DTO', async () => {
    // El DTO protege la puerta HTTP. Esto protege el dato, que es lo que acaba
    // en un expediente: un 150 % en un informe de acreditación no es un detalle.
    const plan = await crearEvaluacion();

    for (const malo of [101, -1]) {
      await expect(
        prisma.medicionAlcanzada.create({
          data: {
            planEvaluacionId: plan.id,
            competenciaId: CMP1,
            periodoId: PER1,
            porcentajeAlcanzado: malo,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it('acepta 0 y 100, que son válidos', async () => {
    const plan = await crearEvaluacion();
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1, porcentajeAlcanzado: 0 },
    });
    await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP2, periodoId: PER1, porcentajeAlcanzado: 100 },
    });

    expect(await prisma.medicionAlcanzada.count()).toBe(2);
  });
});

describe('RF-PE-016 — las asignaturas de un cruce', () => {
  it('la misma asignatura no se asocia dos veces al mismo cruce', async () => {
    const medicion = await crearMedicion();

    await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: medicion.id, asignaturaId: ASIG1, entregable: 'Proyecto' },
    });

    await expect(
      prisma.asignaturaEvaluada.create({
        data: { medicionAlcanzadaId: medicion.id, asignaturaId: ASIG1, entregable: 'Otro' },
      }),
    ).rejects.toThrow();
  });
});

describe('el borrado en cascada', () => {
  it('borrar el plan de evaluación se lleva su configuración entera', async () => {
    // La configuración sin su plan no significa nada, y dejarla huérfana la
    // haría aparecer en un recuento de filas que nadie sabría explicar.
    const plan = await crearEvaluacion();
    const medicion = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
    });
    const asignada = await prisma.asignaturaEvaluada.create({
      data: { medicionAlcanzadaId: medicion.id, asignaturaId: ASIG1, entregable: 'Proyecto' },
    });
    await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: asignada.id, enlace: 'https://x', descripcion: 'Rúbrica' },
    });
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId: CMP1, instrumento: 'Rúbrica' },
    });

    await prisma.planEvaluacion.delete({ where: { id: plan.id } });

    expect(await prisma.configuracionCompetencia.count()).toBe(0);
    expect(await prisma.medicionAlcanzada.count()).toBe(0);
    expect(await prisma.asignaturaEvaluada.count()).toBe(0);
    expect(await prisma.evidencia.count()).toBe(0);
  });
});
```

Con estos ayudantes y constantes en el ámbito del archivo (los identificadores de competencia, periodo y asignatura son UUID sueltos sin clave foránea, igual que en el resto del módulo):

```ts
const CMP1 = randomUUID();
const CMP2 = randomUUID();
const PER1 = randomUUID();
const ASIG1 = randomUUID();

async function crearEvaluacion(codigo = 'EV-1') {
  const base = await prisma.planMedicion.create({
    data: { planEstudiosId, tipo: 'DIRECTA', codigo: `PM-${codigo}`, meta: 0.7, estado: 'VIGENTE' },
  });
  return prisma.planEvaluacion.create({ data: { planMedicionId: base.id, codigo } });
}

async function crearMedicion() {
  const plan = await crearEvaluacion();
  return prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId: CMP1, periodoId: PER1 },
  });
}
```

- [ ] **Step 5: Ejecutar hasta verde**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npx prisma migrate deploy
npm run test:integration -- test/integration/configuracion-evaluacion.int.spec.ts
```

Expected: PASS, 7 pruebas.

- [ ] **Step 6: Comprobar que el `CHECK` está de verdad**

```bash
grep -c "medicion_alcanzada_porcentaje_0_100" prisma/migrations/*_configuracion_evaluacion/migration.sql
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `1`, y «No difference detected».

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/test
git commit -m "Las cuatro tablas de la configuración de evaluación

Tres niveles de dato y tres tablas más la de evidencias, porque cada regla del
documento se convierte así en un índice único en vez de en una comprobación que
alguien tiene que acordarse de escribir: el instrumento es uno por competencia,
el porcentaje uno por cruce, y una asignatura no se asocia dos veces al mismo.

El CHECK del 0 a 100 va en la migración además del DTO. El DTO protege la
puerta HTTP; el CHECK protege el dato, que es lo que acaba en un expediente."
```

---

### Task 3: El puerto y el repositorio de configuración

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/ports/configuracion-evaluacion.port.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.ts`
- Test: `apps/api/test/integration/configuracion-evaluacion.int.spec.ts` (ampliar)

**Interfaces:**
- Consumes: los modelos de la Task 2.
- Produces:

```ts
export interface DatosEvidencia {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
}

export interface DatosAsignaturaEvaluada {
  readonly id: string;
  readonly asignaturaId: string;
  readonly entregable: string;
  readonly docenteId: string | null;
  readonly evidencias: readonly DatosEvidencia[];
}

export interface DatosMedicion {
  readonly competenciaId: string;
  readonly periodoId: string;
  readonly porcentajeAlcanzado: number | null;
  readonly asignaturas: readonly DatosAsignaturaEvaluada[];
}

export interface DatosConfiguracionCompetencia {
  readonly competenciaId: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
}

/** Todo lo configurado de un plan, en una sola lectura. */
export interface ConfiguracionDelPlan {
  readonly competencias: readonly DatosConfiguracionCompetencia[];
  readonly mediciones: readonly DatosMedicion[];
}

export interface RepositorioConfiguracionEvaluacionPort {
  del(planEvaluacionId: string): Promise<ConfiguracionDelPlan>;

  /** RF-PE-013 y RF-PE-014. Crea o actualiza; no hay dos filas por competencia. */
  guardarCompetencia(datos: {
    planEvaluacionId: string;
    competenciaId: string;
    instrumento: string | null;
    frecuencia: string | null;
  }): Promise<void>;

  /**
   * RF-PE-016 a RF-PE-018. **Reemplaza el conjunto entero** del cruce: las que
   * no vengan se borran, con sus evidencias. Crea la fila del cruce si falta.
   */
  reemplazarAsignaturas(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    asignaturas: readonly {
      asignaturaId: string;
      entregable: string;
      docenteId: string | null;
    }[],
  ): Promise<void>;

  /** RF-PE-019. Crea la fila del cruce si falta. */
  guardarPorcentaje(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    porcentaje: number | null,
  ): Promise<void>;

  /** RF-PE-020. Reemplaza el conjunto entero de esa asignatura evaluada. */
  reemplazarEvidencias(
    asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[],
  ): Promise<void>;

  /** Para comprobar que la asignatura evaluada pertenece a ese plan. */
  planDeAsignaturaEvaluada(asignaturaEvaluadaId: string): Promise<string | null>;
}

export const REPOSITORIO_CONFIGURACION_EVALUACION = Symbol(
  'RepositorioConfiguracionEvaluacionPort',
);
```

Las tareas 4 y 5 los consumen.

- [ ] **Step 1: Escribir el puerto**

El bloque **Interfaces** de arriba, tal cual, con esta cabecera:

```ts
/**
 * La configuración de evaluación de un plan, tal como la aplicación la necesita.
 *
 * Los métodos que escriben **reemplazan conjuntos enteros** en vez de aplicar
 * cambios parciales. Es lo que RF-PE-021 pide —guardar el avance de un periodo
 * sin tocar los demás— y de paso hace imposible la carrera de escrituras que
 * mordió en el ciclo de exportación: no hay dos peticiones parciales del mismo
 * cruce que puedan pisarse según el orden en que lleguen.
 */
```

- [ ] **Step 2: Escribir las pruebas de integración en rojo**

Amplía `configuracion-evaluacion.int.spec.ts` con un `describe` nuevo, instanciando `const repo = new ConfiguracionEvaluacionRepositoryPrisma(prisma);`:

```ts
describe('el repositorio', () => {
  it('guardar la competencia dos veces actualiza, no duplica', async () => {
    const plan = await crearEvaluacion();

    await repo.guardarCompetencia({
      planEvaluacionId: plan.id,
      competenciaId: CMP1,
      instrumento: 'Rúbrica',
      frecuencia: 'Semestral',
    });
    await repo.guardarCompetencia({
      planEvaluacionId: plan.id,
      competenciaId: CMP1,
      instrumento: 'Rúbrica analítica',
      frecuencia: 'Anual',
    });

    const { competencias } = await repo.del(plan.id);
    expect(competencias).toHaveLength(1);
    expect(competencias[0]?.instrumento).toBe('Rúbrica analítica');
  });

  it('reemplazar asignaturas crea la fila del cruce si no existía', async () => {
    // `AsignaturaEvaluada` cuelga de `MedicionAlcanzada`: sin esto, asociar una
    // asignatura a un cruce virgen fallaría por clave foránea.
    const plan = await crearEvaluacion();

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto final', docenteId: null },
    ]);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones).toHaveLength(1);
    expect(mediciones[0]?.asignaturas.map((a) => a.entregable)).toEqual(['Proyecto final']);
  });

  it('reemplazar quita las que ya no vienen, con sus evidencias', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
      { asignaturaId: ASIG2, entregable: 'Informe', docenteId: null },
    ]);
    const antes = await repo.del(plan.id);
    const aBorrar = antes.mediciones[0]!.asignaturas.find((a) => a.asignaturaId === ASIG2)!;
    await repo.reemplazarEvidencias(aBorrar.id, [{ enlace: 'https://x', descripcion: 'Acta' }]);

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.asignaturas.map((a) => a.asignaturaId)).toEqual([ASIG1]);
    // La evidencia de la que se fue no queda huérfana en la base.
    expect(await prisma.evidencia.count()).toBe(0);
  });

  it('reemplazar asignaturas NO borra el porcentaje ya registrado', async () => {
    // Son dos cosas distintas del mismo cruce: cambiar qué asignaturas lo
    // evalúan no puede borrar lo que ya se midió.
    const plan = await crearEvaluacion();
    await repo.guardarPorcentaje(plan.id, CMP1, PER1, 80);

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.porcentajeAlcanzado).toBe(80);
  });

  it('guardar el porcentaje NO borra las asignaturas del cruce', async () => {
    // La inversa de la anterior, y hace falta: son dos escrituras sobre la
    // misma fila, y un `update` descuidado en cualquiera de las dos direcciones
    // se lleva por delante lo que la otra guardó.
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);

    await repo.guardarPorcentaje(plan.id, CMP1, PER1, 80);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.asignaturas).toHaveLength(1);
    expect(mediciones[0]?.porcentajeAlcanzado).toBe(80);
  });

  it('una evidencia sobrevive a que se reemplacen las asignaturas si la suya sigue', async () => {
    // Borrar todas las del cruce y recrearlas —en vez de borrar solo las que no
    // vienen— se llevaría por cascada las evidencias de las que se conservan.
    // Desde fuera parece lo mismo; el usuario pierde su trabajo.
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const antes = await repo.del(plan.id);
    await repo.reemplazarEvidencias(antes.mediciones[0]!.asignaturas[0]!.id, [
      { enlace: 'https://a', descripcion: 'Rúbrica firmada' },
    ]);

    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto corregido', docenteId: null },
      { asignaturaId: ASIG2, entregable: 'Informe', docenteId: null },
    ]);

    const tras = await repo.del(plan.id);
    const conservada = tras.mediciones[0]!.asignaturas.find((a) => a.asignaturaId === ASIG1)!;
    expect(conservada.evidencias.map((e) => e.descripcion)).toEqual(['Rúbrica firmada']);
    expect(conservada.entregable).toBe('Proyecto corregido');
  });

  it('guardar el porcentaje crea la fila del cruce si no existía', async () => {
    const plan = await crearEvaluacion();

    await repo.guardarPorcentaje(plan.id, CMP1, PER1, 65);

    const { mediciones } = await repo.del(plan.id);
    expect(mediciones[0]?.porcentajeAlcanzado).toBe(65);
  });

  it('las evidencias conservan el orden en que llegaron', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;

    await repo.reemplazarEvidencias(ae.id, [
      { enlace: 'https://a', descripcion: 'Rúbrica firmada' },
      { enlace: 'https://b', descripcion: 'Acta de la reunión' },
    ]);

    const tras = await repo.del(plan.id);
    expect(tras.mediciones[0]?.asignaturas[0]?.evidencias.map((e) => e.descripcion)).toEqual([
      'Rúbrica firmada',
      'Acta de la reunión',
    ]);
  });

  it('planDeAsignaturaEvaluada dice de qué plan es, y null si no existe', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;

    expect(await repo.planDeAsignaturaEvaluada(ae.id)).toBe(plan.id);
    expect(await repo.planDeAsignaturaEvaluada(randomUUID())).toBeNull();
  });
});
```

Añade `const ASIG2 = randomUUID();` a las constantes del archivo.

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/configuracion-evaluacion.int.spec.ts
```

Expected: FAIL — no existe el repositorio.

- [ ] **Step 4: Escribir el repositorio**

Sigue el patrón de `plan-evaluacion.repository.ts`: `@Injectable`, `PrismaService` por constructor, una `SELECCION` explícita y funciones de mapeo puras.

Puntos que las pruebas fijan:

- `guardarCompetencia` usa `upsert` sobre el índice único `(planEvaluacionId, competenciaId)`.
- `guardarPorcentaje` usa `upsert` sobre `(planEvaluacionId, competenciaId, periodoId)`, con `create` poniendo el porcentaje y `update` solo el porcentaje — **nunca tocando las asignaturas**.
- `reemplazarAsignaturas` es el método delicado, así que va escrito entero:

```ts
  async reemplazarAsignaturas(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    asignaturas: readonly { asignaturaId: string; entregable: string; docenteId: string | null }[],
  ): Promise<void> {
    const ids = asignaturas.map((a) => a.asignaturaId);

    await this.prisma.$transaction(async (tx) => {
      // La fila del cruce puede no existir todavía: `AsignaturaEvaluada` cuelga
      // de ella. El `update` va vacío a propósito — asegurar que existe no debe
      // tocar el porcentaje que alguien ya registró.
      const cruce = await tx.medicionAlcanzada.upsert({
        where: {
          planEvaluacionId_competenciaId_periodoId: { planEvaluacionId, competenciaId, periodoId },
        },
        create: { planEvaluacionId, competenciaId, periodoId },
        update: {},
        select: { id: true },
      });

      // Solo las que ya no vienen. Borrarlas todas y recrearlas daría el mismo
      // resultado visible y se llevaría por cascada las evidencias de las que
      // se conservan — el usuario perdería su trabajo sin que nada lo avise.
      await tx.asignaturaEvaluada.deleteMany({
        where: { medicionAlcanzadaId: cruce.id, asignaturaId: { notIn: ids } },
      });

      for (const a of asignaturas) {
        await tx.asignaturaEvaluada.upsert({
          where: {
            medicionAlcanzadaId_asignaturaId: {
              medicionAlcanzadaId: cruce.id,
              asignaturaId: a.asignaturaId,
            },
          },
          create: {
            medicionAlcanzadaId: cruce.id,
            asignaturaId: a.asignaturaId,
            entregable: a.entregable,
            docenteId: a.docenteId,
          },
          update: { entregable: a.entregable, docenteId: a.docenteId },
        });
      }
    });
  }
```

`deleteMany` con `notIn: []` borra **todas** las filas, que es justo lo que hace
falta cuando la lista llega vacía: quitar la última asignatura de un cruce.
- `reemplazarEvidencias` también en transacción: `deleteMany` de las de esa asignatura evaluada y `createMany` de las nuevas, con `orden` igual al índice del array.
- `del` devuelve todo en una consulta con `include` anidado, ordenando evidencias por `orden` y asignaturas por `asignaturaId` para que el resultado sea estable.

- [ ] **Step 5: Verde y comprobación por mutación**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm run typecheck && npm run lint && npm run format:check
```

Expected: 262 de integración (253 + tus 9).

Mutaciones, una a una y restaurando entre ellas:

| Mutación | Prueba que debe fallar |
|---|---|
| En `reemplazarAsignaturas`, borrar **todas** las del cruce y recrearlas, en vez de borrar solo las que no vienen | «una evidencia sobrevive a que se reemplacen las asignaturas si la suya sigue» |
| En `guardarPorcentaje`, añadir `asignaturas: { deleteMany: {} }` al `update` | «guardar el porcentaje NO borra las asignaturas del cruce» |
| En `reemplazarAsignaturas`, incluir `porcentajeAlcanzado: null` en el `update` del cruce | «reemplazar asignaturas NO borra el porcentaje ya registrado» |

Las tres son el mismo error visto desde tres lados: dos escrituras sobre la
misma fila que se pisan. Si alguna no rompe la prueba que dice, la prueba no
vale y hay que rehacerla antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "El repositorio de la configuración de evaluación

Los métodos de escritura reemplazan conjuntos enteros en vez de aplicar cambios
parciales: es lo que RF-PE-021 pide, y hace imposible la carrera de escrituras
que mordió en el ciclo de exportación.

Reemplazar asignaturas borra solo las que no vienen, no todas: borrarlas todas
se llevaría por cascada las evidencias de las que se conservan."
```

---

### Task 4: El caso de uso

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/domain/events/eventos-evaluacion.ts`

**Interfaces:**
- Consumes: `RepositorioConfiguracionEvaluacionPort` (Task 3), `asignaturasDelPlan` y `porRol` (Task 1), y de 2c-A: `RepositorioPlanEvaluacionPort`, `RepositorioPlanMedicionPort`, `ContenidoCurricularPort`, `AuthorizationPort`, `permiteEdicion`.
- Produces:

```ts
export class ConfigurarPlanEvaluacion {
  asignaturasElegibles(actor: Actor, planEvaluacionId: string): Promise<AsignaturaBase[]>;
  docentes(actor: Actor): Promise<{ id: string; nombre: string }[]>;
  configuracion(actor: Actor, planEvaluacionId: string): Promise<ConfiguracionDelPlan>;
  guardarCompetencia(actor: Actor, planEvaluacionId: string, competenciaId: string,
    datos: { instrumento: string | null; frecuencia: string | null }): Promise<void>;
  guardarAsignaturas(actor: Actor, planEvaluacionId: string, competenciaId: string, periodoId: string,
    asignaturas: readonly { asignaturaId: string; entregable: string; docenteId: string | null }[]): Promise<void>;
  guardarPorcentaje(actor: Actor, planEvaluacionId: string, competenciaId: string,
    periodoId: string, porcentaje: number | null): Promise<void>;
  guardarEvidencias(actor: Actor, asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[]): Promise<void>;
}
```

La Task 5 los consume.

- [ ] **Step 1: Añadir el evento de auditoría**

En `eventos-evaluacion.ts`, junto a los tres que ya hay:

```ts
/**
 * RF-PE-048. Uno solo para toda la configuración, y no cuatro.
 *
 * La bitácora la lee alguien que pregunta «qué se tocó de este plan y cuándo»,
 * no «qué columna cambió». Cuatro eventos por cada guardado de un periodo
 * enterrarían las transiciones de estado, que es lo que de verdad se busca.
 */
export class ConfiguracionEvaluacionCambiada extends EventoEvaluacion {
  readonly nombre = 'evaluacion.configurada';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    que: string,
  ) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo}: ${que}.`;
  }
}
```

- [ ] **Step 2: Escribir las pruebas en rojo**

`configurar-plan-evaluacion.spec.ts`. Sigue el patrón de `gestionar-planes-evaluacion.spec.ts`: dobles de los puertos, `permitirTodo()`, `denegarRegistrando(pedidos)`, y un `montar()` que devuelve `{ caso, publicados, guardado }`.

```ts
describe('RF-PE-012 — solo donde la matriz base programó', () => {
  it('rechaza configurar un cruce que no está programado', async () => {
    // Sin esto, el plan de evaluación podría registrar medición donde el plan
    // de medición nunca dijo que se mediría.
    const { caso } = montar({ programadas: ['c-1|p-1'] });

    await expect(
      caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-2', [
        { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
      ]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('acepta el que sí lo está', async () => {
    const { caso, guardado } = montar({ programadas: ['c-1|p-1'] });

    await caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [
      { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
    ]);

    expect(guardado.asignaturas).toHaveLength(1);
  });
});

describe('RF-PE-016 — solo asignaturas del plan de estudios base', () => {
  it('rechaza una asignatura ajena, nombrándola', async () => {
    const { caso } = montar({ asignaturas: [asignatura({ id: 'a-1', codigo: 'ASUC001' })] });

    await expect(
      caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [
        { asignaturaId: 'a-ajena', entregable: 'Proyecto', docenteId: null },
      ]),
    ).rejects.toThrow(/a-ajena/);
  });
});

describe('RF-PE-013 — la competencia tiene que estar declarada', () => {
  it('rechaza configurar una competencia que el plan base no mide', async () => {
    const { caso } = montar({ competenciasDelPlan: ['c-1'] });

    await expect(
      caso.guardarCompetencia(ACTOR, 'ev-1', 'c-ajena', {
        instrumento: 'Rúbrica',
        frecuencia: 'Semestral',
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF-PE-006 y RF-PE-007 — la frontera de estados', () => {
  it('la definición solo se toca en Borrador', async () => {
    for (const estado of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso } = montar({ evaluacion: evaluacion({ estado }) });

      await expect(
        caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'R', frecuencia: 'S' }),
      ).rejects.toThrow(ReglaDeNegocioViolada);
      await expect(
        caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', []),
      ).rejects.toThrow(ReglaDeNegocioViolada);
    }
  });

  it('el porcentaje se registra en Borrador y en Vigente', async () => {
    // RF-PE-006 RN2: el registro progresivo de mediciones es la excepción. Sin
    // ella, el porcentaje alcanzado de 2026-I no podría registrarse nunca,
    // porque no se conoce mientras el plan sigue en Borrador.
    for (const estado of ['Borrador', 'Vigente'] as const) {
      const { caso, guardado } = montar({ evaluacion: evaluacion({ estado }) });

      await caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80);

      expect(guardado.porcentaje).toBe(80);
    }
  });

  it('pero no en Aprobado ni en Histórico', async () => {
    // RN2 nombra solo Vigente. Un plan Aprobado todavía no rige: registrar en
    // él lo ocurrido sería seguimiento de un plan que no ha entrado en vigor.
    for (const estado of ['Aprobado', 'Histórico', 'En revisión'] as const) {
      const { caso } = montar({ evaluacion: evaluacion({ estado }) });

      await expect(
        caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80),
      ).rejects.toThrow(ReglaDeNegocioViolada);
    }
  });

  it('las evidencias siguen la misma regla que el porcentaje', async () => {
    const { caso, guardado } = montar({ evaluacion: evaluacion({ estado: 'Vigente' }) });

    await caso.guardarEvidencias(ACTOR, 'ae-1', [{ enlace: 'https://x', descripcion: 'Rúbrica' }]);

    expect(guardado.evidencias).toHaveLength(1);
  });
});

describe('las evidencias de otro plan', () => {
  it('no se pueden tocar desde este', async () => {
    // `asignaturaEvaluadaId` llega suelto en la ruta: sin comprobar de qué plan
    // es, cualquiera con permiso podría escribir evidencias en el plan de otra
    // carrera sabiendo un identificador.
    const { caso } = montar({ planDeAsignaturaEvaluada: 'ev-OTRO' });

    await expect(
      caso.guardarEvidencias(ACTOR, 'ae-1', [{ enlace: 'https://x', descripcion: 'R' }]),
    ).rejects.toThrow();
  });
});

describe('permisos y bitácora', () => {
  it('escribir exige `evaluacion.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(
      caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'R', frecuencia: 'S' }),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.editar']);
  });

  it('leer exige `evaluacion.leer`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.configuracion(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer']);
  });

  it('cada guardado deja constancia, diciendo qué se tocó', async () => {
    const { caso, publicados } = montar();

    await caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80);

    expect(publicados[0]?.nombre).toBe('evaluacion.configurada');
    expect(publicados[0]?.detalle).toMatch(/porcentaje/i);
  });
});

describe('los catálogos', () => {
  it('las asignaturas elegibles salen del plan de estudios de la base', async () => {
    const { caso } = montar({ asignaturas: [asignatura({ codigo: 'ASUC001' })] });

    expect((await caso.asignaturasElegibles(ACTOR, 'ev-1')).map((a) => a.codigo)).toEqual([
      'ASUC001',
    ]);
  });

  it('los docentes son los usuarios con rol DOCENTE', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ registrarRolPedido: (r) => pedidos.push(r) });

    await caso.docentes(ACTOR);

    expect(pedidos).toEqual(['DOCENTE']);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/application/
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 4: Escribir el caso de uso**

Puntos que las pruebas fijan:

- Un ayudante privado `exigirPlan(id)` que devuelve el plan de evaluación o lanza `NoEncontrado`.
- Un ayudante `exigirDefinicionEditable(plan)` que lanza si `!permiteEdicion(plan.estado)`, con el estado en el mensaje y la sugerencia de versionar (RF-PE-006).
- Un ayudante `exigirSeguimientoEditable(plan)` que acepta **solo** `Borrador` y `Vigente`, con un mensaje que diga que el registro de mediciones solo cabe sobre un plan en Borrador o Vigente.
- `guardarAsignaturas` comprueba, en este orden: permiso, plan existe, definición editable, cruce programado (leyendo `matriz` del plan de medición base), y cada `asignaturaId` contra `asignaturasDelPlan`.
- `guardarCompetencia` comprueba que la competencia esté en `base.competenciaIds`.
- `guardarEvidencias` comprueba que `planDeAsignaturaEvaluada(id)` coincida con un plan cuyo seguimiento sea editable; si devuelve `null`, `NoEncontrado`.
- **El docente no se valida contra su rol.** Se guarda el UUID que llega. Validarlo convertiría un cambio de rol futuro en un dato histórico inválido; la pantalla ofrece solo docentes y el registro conserva a quien fuera responsable entonces.
- Cada método que escribe publica `ConfiguracionEvaluacionCambiada` con un `que` legible: `'instrumento y frecuencia de una competencia'`, `'asignaturas de una competencia en un periodo'`, `'porcentaje alcanzado'`, `'evidencias de una asignatura'`.

- [ ] **Step 5: Verde y comprobación por mutación**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
```

Expected: 743 + tus pruebas.

Mutaciones, una a una, restaurando entre ellas:

| Mutación | Prueba que debe fallar |
|---|---|
| Quitar la comprobación del cruce programado en `guardarAsignaturas` | «rechaza configurar un cruce que no está programado» |
| Hacer que `guardarPorcentaje` use `exigirDefinicionEditable` | «el porcentaje se registra en Borrador y en Vigente» |
| Hacer que `guardarCompetencia` use `exigirSeguimientoEditable` | «la definición solo se toca en Borrador» |
| Quitar la comprobación de `planDeAsignaturaEvaluada` | «las evidencias de otro plan no se pueden tocar» |

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "El caso de uso de la configuración de evaluación

La frontera de estados en dos guardianes distintos: la definición del plan solo
se toca en Borrador; el porcentaje y las evidencias también en Vigente, porque
RF-PE-006 RN2 lo exceptúa y sin esa excepción no habría forma de registrar lo
que ocurrió — el porcentaje de 2026-I no se conoce mientras el plan se redacta.

El docente no se valida contra su rol al guardar: un cambio de rol futuro no
debe invalidar un registro histórico."
```

---

### Task 5: Los endpoints

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/configuracion-evaluacion.controller.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/dto/configuracion-evaluacion.dto.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ConfigurarPlanEvaluacion` (Task 4), `REPOSITORIO_CONFIGURACION_EVALUACION` (Task 3).
- Produces: los siete endpoints que consume la Task 6.

- [ ] **Step 1: Escribir los DTO**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, IsUrl,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class ConfiguracionCompetenciaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) instrumento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) frecuencia?: string;
}

export class AsignaturaEvaluadaDto {
  @IsUUID() asignaturaId!: string;

  /** RF-PE-017 RN1: obligatorio. Vacío no vale como entregable. */
  @IsString() @MinLength(1) @MaxLength(300) entregable!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() docenteId?: string;
}

export class AsignaturasDelCruceDto {
  @ApiProperty({ type: [AsignaturaEvaluadaDto] })
  @IsArray()
  // Un cruce con cincuenta asignaturas no es un plan, es un error de carga.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AsignaturaEvaluadaDto)
  asignaturas!: AsignaturaEvaluadaDto[];
}

export class PorcentajeDto {
  /** RF-PE-019 RN2. El CHECK de la base es la segunda barrera. */
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  porcentajeAlcanzado?: number;
}

export class EvidenciaDto {
  /** `IsUrl` y no `IsString`: un enlace que no es un enlace no es evidencia de nada. */
  @IsUrl({ require_protocol: true }) @MaxLength(2000) enlace!: string;

  @IsString() @MinLength(1) @MaxLength(200) descripcion!: string;
}

export class EvidenciasDto {
  @ApiProperty({ type: [EvidenciaDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias!: EvidenciaDto[];
}
```

- [ ] **Step 2: Escribir el controlador**

Cada método con `@ApiOperation` y `@ApiResponse`, siguiendo `planes-evaluacion.controller.ts`.

```ts
/**
 * Endpoints de la configuración de evaluación (RF-PE-013 a RF-PE-021).
 *
 * La frontera de estados está **en la forma de esta API**, no en una
 * comparación dentro del caso de uso: los tres primeros `PUT` exigen Borrador;
 * los dos últimos aceptan también un plan Vigente, porque RF-PE-006 RN2
 * exceptúa el registro progresivo de mediciones. Quien lea este archivo ve la
 * regla sin abrir nada más.
 *
 * Cada `PUT` reemplaza su conjunto entero. Eso satisface RF-PE-021 —guardar el
 * avance de un periodo sin tocar los demás— con una petición por guardado, y
 * evita por construcción que dos escrituras parciales del mismo cruce se pisen
 * según el orden en que lleguen.
 */

@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-evaluacion/:planId')
export class ConfiguracionEvaluacionController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Get('configuracion')
  @ApiOperation({ summary: 'Todo lo configurado del plan (RF-PE-013 a RF-PE-021)' })
  async configuracion(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.casos.configuracion(actor, planId);
  }

  @Get('asignaturas-elegibles')
  @ApiOperation({
    summary: 'Asignaturas del plan de estudios base',
    description: 'RF-PE-016: solo las del plan de estudios del plan de medición base.',
  })
  async asignaturas(@Param('planId', ParseUUIDPipe) planId: string, @ActorActual() actor: Actor) {
    return this.casos.asignaturasElegibles(actor, planId);
  }

  @Put('competencias/:competenciaId')
  @ApiOperation({
    summary: 'Instrumento y frecuencia de una competencia (RF-PE-013, RF-PE-014)',
    description: 'Valen para todos los periodos: RF-PE-013 RN1. Solo en Borrador.',
  })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador, o la competencia no es del plan base.' })
  async competencia(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @ActorActual() actor: Actor,
    @Body() dto: ConfiguracionCompetenciaDto,
  ) {
    await this.casos.guardarCompetencia(actor, planId, competenciaId, {
      instrumento: dto.instrumento ?? null,
      frecuencia: dto.frecuencia ?? null,
    });
  }

  @Put('competencias/:competenciaId/periodos/:periodoId/asignaturas')
  @ApiOperation({
    summary: 'Asignaturas que evalúan la competencia en el periodo (RF-PE-016 a RF-PE-018)',
    description: 'Reemplaza el conjunto entero del cruce. Solo en Borrador.',
  })
  @ApiResponse({ status: 409, description: 'El cruce no está programado en la matriz base, o el plan no está en Borrador.' })
  async asignaturasDelCruce(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @Param('periodoId', ParseUUIDPipe) periodoId: string,
    @ActorActual() actor: Actor,
    @Body() dto: AsignaturasDelCruceDto,
  ) {
    await this.casos.guardarAsignaturas(
      actor,
      planId,
      competenciaId,
      periodoId,
      dto.asignaturas.map((a) => ({
        asignaturaId: a.asignaturaId,
        entregable: a.entregable,
        docenteId: a.docenteId ?? null,
      })),
    );
  }

  @Put('competencias/:competenciaId/periodos/:periodoId/medicion')
  @ApiOperation({
    summary: 'Porcentaje alcanzado en el periodo (RF-PE-019)',
    description:
      'Un único valor por competencia y periodo (RN1), de 0 a 100 (RN2). Se ' +
      'admite también con el plan Vigente: RF-PE-006 RN2 exceptúa el registro ' +
      'progresivo de mediciones.',
  })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador ni Vigente.' })
  async medicion(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('competenciaId', ParseUUIDPipe) competenciaId: string,
    @Param('periodoId', ParseUUIDPipe) periodoId: string,
    @ActorActual() actor: Actor,
    @Body() dto: PorcentajeDto,
  ) {
    await this.casos.guardarPorcentaje(
      actor,
      planId,
      competenciaId,
      periodoId,
      dto.porcentajeAlcanzado ?? null,
    );
  }
}

/**
 * Las evidencias cuelgan de la asignatura evaluada y no del plan: es su dueño
 * real, y colgarlas del plan obligaría a repetir competencia y periodo en la
 * ruta para llegar a algo que ya tiene identificador propio.
 */
@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('asignaturas-evaluadas/:id')
export class EvidenciasController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Put('evidencias')
  @ApiOperation({
    summary: 'Enlaces de evidencia del entregable (RF-PE-020)',
    description:
      'Reemplaza el conjunto entero. Enlaces, no archivos: divergencia D-12 ' +
      'del registro. Se admite con el plan Vigente, como el porcentaje.',
  })
  @ApiResponse({ status: 404, description: 'La asignatura evaluada no existe.' })
  async evidencias(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EvidenciasDto,
  ) {
    await this.casos.guardarEvidencias(actor, id, dto.evidencias);
  }
}

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('docentes')
export class DocentesController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Get()
  @ApiOperation({
    summary: 'Cuentas activas con rol DOCENTE (RF-PE-018)',
    description: 'Catálogo para elegir responsable. Exige `evaluacion.leer`.',
  })
  async listar(@ActorActual() actor: Actor) {
    return this.casos.docentes(actor);
  }
}
```

**Cuidado con el orden de las rutas** en `ConfiguracionEvaluacionController`: cuelga de `planes-evaluacion/:planId`, y el controlador de 2c-A ya tiene `GET /planes-evaluacion/:id`. Nest los distingue por la ruta completa, así que no chocan — pero **comprueba en el log de arranque** que `configuracion` y `asignaturas-elegibles` aparecen mapeadas, no absorbidas.

- [ ] **Step 3: Cablear en `app.module.ts`**

Los tres controladores en `controllers`, y dos proveedores junto a los de 2c-A:

```ts
    {
      provide: REPOSITORIO_CONFIGURACION_EVALUACION,
      useClass: ConfiguracionEvaluacionRepositoryPrisma,
    },
    {
      provide: ConfigurarPlanEvaluacion,
      inject: [
        REPOSITORIO_CONFIGURACION_EVALUACION,
        REPOSITORIO_PLAN_EVALUACION,
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        DIRECTORIO_USUARIOS,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        configuracion: RepositorioConfiguracionEvaluacionPort,
        evaluaciones: RepositorioPlanEvaluacionPort,
        mediciones: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        directorio: DirectorioDeUsuariosPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new ConfigurarPlanEvaluacion(
          configuracion, evaluaciones, mediciones, curricular, directorio, autorizacion, eventos,
        ),
    },
```

- [ ] **Step 4: Comprobar contra la API levantada**

Este paso encuentra lo que el typecheck no ve. En los dos ciclos anteriores destapó un token sin exportar y un orden de rutas mal.

```bash
docker start sgc_postgres sgc_redis          # se paran solos al reiniciar la máquina
cd apps/api && npm run build
export $(grep -E '^(DATABASE_URL|JWT_SECRET|REDIS_URL|DOCUMENTOS_DIR)=' .env | tr -d '"' | tr '\n' ' ')
THROTTLE_LIMIT=10000 node dist/main.js > /tmp/api.log 2>&1 &
```

Comprueba primero el mapeo de rutas: `grep 'planes-evaluacion' /tmp/api.log`. Deben salir las de 2c-A **y** `configuracion`, `asignaturas-elegibles`, las tres `PUT`, más `/docentes` y `/asignaturas-evaluadas/:id/evidencias`.

Con un token de `e2e-editor@sgc.local` (`E2E.Pruebas.2026!`) y el id de un plan de evaluación en Borrador:

```bash
API=http://localhost:3000/api/v1
curl -s "$API/planes-evaluacion/<id>/asignaturas-elegibles" -H "authorization: Bearer $TOKEN"
curl -s "$API/docentes" -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$API/planes-evaluacion/<id>/competencias/<cId>" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"instrumento":"Rúbrica analítica","frecuencia":"Semestral"}'
curl -s "$API/planes-evaluacion/<id>/configuracion" -H "authorization: Bearer $TOKEN"
```

Expected: la lista de asignaturas con su ciclo; `/docentes` **probablemente vacío** —el seed crea el rol pero ningún usuario con él, está anotado en §11 de la spec—; el `PUT` en 200; y la configuración devolviendo lo guardado.

Comprueba también los errores: porcentaje 101 → **400**; `PUT` de competencia sobre un plan Vigente → **409**; sin token → **401**.

- [ ] **Step 5: Verificar y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
git add apps/api/src
git commit -m "Los endpoints de la configuración de evaluación

La frontera de estados va en la forma de la API: tres PUT que exigen Borrador y
dos que aceptan también Vigente. Quien lea el controlador ve la regla sin abrir
el caso de uso.

Las evidencias cuelgan de la asignatura evaluada, que es su dueño real, en vez
de repetir competencia y periodo en la ruta para llegar a algo que ya tiene
identificador propio."
```

---

### Task 6: La pantalla

**Files:**
- Modify: `apps/web/src/features/mejora-continua/domain/tipos.ts`
- Create: `apps/web/src/features/mejora-continua/api/configuracion-evaluacion.api.ts`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts`
- Create: `apps/web/src/features/mejora-continua/components/ConfiguracionDelPeriodo.tsx`
- Test: `apps/web/src/features/mejora-continua/components/ConfiguracionDelPeriodo.test.tsx`
- Modify: `apps/web/src/features/mejora-continua/pages/PlanEvaluacionPage.tsx`

**Interfaces:**
- Consumes: los endpoints de la Task 5.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Tipos y capa de datos**

En `tipos.ts`:

```ts
export interface AsignaturaElegible {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly cicloNumero: number | null;
  readonly activa: boolean;
}

export interface Docente {
  readonly id: string;
  readonly nombre: string;
}

export interface EvidenciaRegistrada {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
}

export interface AsignaturaEvaluada {
  readonly id: string;
  readonly asignaturaId: string;
  readonly entregable: string;
  readonly docenteId: string | null;
  readonly evidencias: readonly EvidenciaRegistrada[];
}

export interface MedicionDeCruce {
  readonly competenciaId: string;
  readonly periodoId: string;
  readonly porcentajeAlcanzado: number | null;
  readonly asignaturas: readonly AsignaturaEvaluada[];
}

export interface ConfiguracionDelPlan {
  readonly competencias: readonly {
    readonly competenciaId: string;
    readonly instrumento: string | null;
    readonly frecuencia: string | null;
  }[];
  readonly mediciones: readonly MedicionDeCruce[];
}
```

En `configuracion-evaluacion.api.ts`, las siete llamadas que corresponden a los siete endpoints.

En `queries.ts`, las claves y los hooks. **Todas las mutaciones de configuración usan el mismo `scope`**, para que dos guardados del mismo plan no se pisen:

```ts
export const clavesConfig = {
  configuracion: (id: string) => ['evaluacion', id, 'configuracion'] as const,
  asignaturas: (id: string) => ['evaluacion', id, 'asignaturas-elegibles'] as const,
  docentes: () => ['docentes'] as const,
};

function useMutacionDeConfiguracion<TVars>(planId: string, fn: (v: TVars) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    // Las escrituras sobre un mismo plan van en fila. Son lee-modifica-escribe
    // sobre conjuntos del mismo plan, y dos en vuelo se resolverían por orden
    // de llegada — que no lo decide el cliente.
    scope: { id: `plan-evaluacion:${planId}` },
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: clavesConfig.configuracion(planId) });
    },
  });
}
```

- [ ] **Step 2: Escribir la prueba del componente en rojo**

`ConfiguracionDelPeriodo.test.tsx`:

```tsx
/** @vitest-environment jsdom */

/**
 * RF-PE-013 a RF-PE-021 en pantalla.
 *
 * Lo que se vigila: que solo aparezcan las competencias programadas en el
 * periodo elegido (RF-PE-012), que el instrumento se anuncie como común a todos
 * los periodos (RF-PE-013 RN1), que el porcentaje sea uno por competencia y no
 * por asignatura (RF-PE-019 RN1), y que con el plan Vigente solo el porcentaje
 * y las evidencias acepten cambios.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfiguracionDelPeriodo } from './ConfiguracionDelPeriodo';

const COMPETENCIAS = [
  { id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
  { id: 'c-2', codigo: 'CPE-02', nombre: 'Modelar sistemas' },
];

function montar(sobre: Partial<Parameters<typeof ConfiguracionDelPeriodo>[0]> = {}) {
  const props = {
    competencias: COMPETENCIAS,
    periodo: { id: 'p-1', etiqueta: '2026-I', orden: 1 },
    programadas: ['c-1|p-1'],
    configuracion: { competencias: [], mediciones: [] },
    asignaturas: [{ id: 'a-1', codigo: 'ASUC001', nombre: 'Cálculo I', cicloNumero: 1, activa: true }],
    docentes: [{ id: 'd-1', nombre: 'Ana Docente' }],
    editable: true,
    seguimientoEditable: true,
    onGuardarCompetencia: vi.fn(),
    onGuardarAsignaturas: vi.fn(),
    onGuardarPorcentaje: vi.fn(),
    onGuardarEvidencias: vi.fn(),
    ...sobre,
  };
  render(<ConfiguracionDelPeriodo {...props} />);
  return props;
}

describe('RF-PE-012 — solo lo programado', () => {
  it('muestra la competencia programada en este periodo', () => {
    montar();

    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
  });

  it('y no muestra la que no lo está', () => {
    // Enseñarla desactivada sería ofrecer algo que no se puede hacer: en este
    // periodo esa competencia no se mide, así que no hay nada que configurar.
    montar();

    expect(screen.queryByText(/CPE-02/)).not.toBeInTheDocument();
  });
});

describe('lo que el requisito exige que se vea', () => {
  it('avisa de que el instrumento vale para todos los periodos', () => {
    // RF-PE-013 RN1. Sin el aviso, quien lo edite creerá que configura solo
    // este periodo y se sorprenderá al abrir el siguiente.
    montar();

    expect(screen.getByText(/todos los periodos/i)).toBeInTheDocument();
  });

  it('el porcentaje es uno por competencia, no uno por asignatura', () => {
    // RF-PE-019 RN1.
    montar({
      configuracion: {
        competencias: [],
        mediciones: [
          {
            competenciaId: 'c-1',
            periodoId: 'p-1',
            porcentajeAlcanzado: 80,
            asignaturas: [
              { id: 'ae-1', asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null, evidencias: [] },
              { id: 'ae-2', asignaturaId: 'a-2', entregable: 'Informe', docenteId: null, evidencias: [] },
            ],
          },
        ],
      },
    });

    expect(screen.getAllByRole('spinbutton', { name: /porcentaje/i })).toHaveLength(1);
  });
});

describe('con el plan Vigente', () => {
  it('el porcentaje sigue aceptando cambios', () => {
    montar({ editable: false, seguimientoEditable: true });

    expect(screen.getByRole('spinbutton', { name: /porcentaje/i })).toBeEnabled();
  });

  it('pero el instrumento no, y dice por qué', () => {
    // Un campo desactivado y mudo hace pensar en un fallo. El motivo lo
    // convierte en información.
    montar({ editable: false, seguimientoEditable: true });

    expect(screen.getByRole('textbox', { name: /instrumento/i })).toBeDisabled();
    expect(screen.getByText(/aprobado|nueva versión/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/ConfiguracionDelPeriodo.test.tsx
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 4: Escribir el componente y conectarlo**

`ConfiguracionDelPeriodo.tsx` recibe las props del `montar()` de arriba y no consulta nada: la página le pasa los datos y recibe los avisos, igual que `DocumentosDelPlan` y `HeredadoDelPlanBase`.

Por cada competencia programada en el periodo elegido: el instrumento y la frecuencia con la nota de que valen para todos los periodos; **un** campo de porcentaje; y la lista de asignaturas con su entregable, su docente y sus evidencias. Los desplegables de asignatura agrupan por ciclo con `<optgroup>`.

En `PlanEvaluacionPage.tsx`, una `Tarjeta` nueva bajo la de lo heredado, con el selector de periodo encima. `editable` es `permiteEdicion(plan.estado)`; `seguimientoEditable` es `plan.estado === 'Borrador' || plan.estado === 'Vigente'`.

- [ ] **Step 5: Verde y comprobación por mutación**

```bash
cd apps/web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
```

Expected: 191 + tus 6.

Mutación: haz que el componente pinte **todas** las competencias en vez de solo las programadas. Debe fallar «y no muestra la que no lo está». Restaura.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "La pantalla de configuración del periodo

Solo aparecen las competencias que la matriz base programó en ese periodo:
enseñar las demás desactivadas sería ofrecer algo que no se puede hacer.

Con el plan Vigente, el porcentaje y las evidencias siguen aceptando cambios y
el resto se desactiva con el motivo escrito al lado — un campo desactivado y
mudo hace pensar en un fallo."
```

---

### Task 7: E2E, accesibilidad y cierre

**Files:**
- Create: `tests/e2e/specs/configuracion-evaluacion.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts`
- Modify: `apps/api/scripts/preparar-e2e.ts`
- Modify: `docs/requisitos/PROMPT_CLAUDE_CODE_PLAN_ESTUDIOS_UI.md`, `docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: todo lo anterior; el fixture `test` de `tests/e2e/fixtures/sesion.ts`.
- Produces: nada.

- [ ] **Step 1: Dos cuentas nuevas para las pruebas**

**Las cuentas E2E no se crean en `preparar-e2e.ts`** —ese guion solo prepara la carrera, el plan de estudios y los planes de medición—: se crean con `apps/api/scripts/crear-usuario.ts`, invocado desde el paso «Crear las cuentas de prueba» de `.github/workflows/ci.yml` (líneas ~310-313). Hacen falta dos más:

```yaml
          SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts             --email e2e-docente@sgc.local --nombre "E2E Docente"             --rol DOCENTE --carrera E2E
          SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts             --email e2e-director@sgc.local --nombre "E2E Director"             --rol DIRECTOR_CARRERA --carrera E2E
```

Y en local, los mismos dos comandos antes de correr la suite.

**Por qué cada una:**

- **El docente**, porque el desplegable de responsables saldría vacío —el seed crea el rol pero ningún usuario con él, anotado en §11 de la spec— y el recorrido no podría elegir a nadie.
- **El director**, porque `e2e-editor` es **`COORDINADOR_ACADEMICO`**, y ese rol **no tiene `evaluacion.aprobar`**: quien construye no da el visto bueno (RF-PE-046). Sin una cuenta que apruebe, el segundo recorrido no puede llevar el plan a Vigente.

Añade el director a `CUENTAS` en `tests/e2e/global-setup.ts`, junto a `editor` y `lector`:

```ts
export const CUENTAS = {
  editor: { email: 'e2e-editor@sgc.local' },
  lector: { email: 'e2e-lector@sgc.local' },
  director: { email: 'e2e-director@sgc.local' },
};
```

`Rol` se deriva de ahí (`keyof typeof CUENTAS`), así que `test.use({ rol: 'director' })` funcionará sin tocar nada más. **Ojo con el límite de login:** son cinco por minuto y `global-setup` gasta uno por cuenta; con tres cuentas la suite gasta tres por ejecución, así que dos ejecuciones seguidas rozan el límite. Si ves un 429, espera un minuto.

**La limpieza del guion no hay que tocarla:** ya borra los planes de evaluación antes que los de medición —se arregló en 2c-A por el `Restrict`— y el `Cascade` de 2c-B se lleva la configuración con ellos.

- [ ] **Step 2: Escribir el recorrido**

```ts
/**
 * RF-PE-013 a RF-PE-021 contra la aplicación entera.
 *
 * Lo que solo se ve aquí: que configurar un periodo no toque los demás
 * (RF-PE-021), y que un plan Vigente deje registrar el porcentaje pero no
 * cambiar las asignaturas (RF-PE-006 RN2).
 */

import { expect, test } from '../fixtures/sesion';

test('configurar un periodo deja los demás intactos', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();
  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-I' });

  await page.getByRole('textbox', { name: /instrumento/i }).first().fill('Rúbrica analítica');
  await page.getByRole('button', { name: 'Guardar el periodo' }).click();

  // Se espera a la respuesta y no a que la pantalla se vea bien: la pantalla
  // adelanta el cambio, así que afirmar sobre ella sin esto pasaría aunque no
  // se hubiera guardado nada.
  await expect(page.getByText(/guardado/i)).toBeVisible();

  // RF-PE-021: el otro periodo sigue vacío.
  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-II' });
  await expect(page.getByRole('textbox', { name: /instrumento/i }).first()).toHaveValue(
    'Rúbrica analítica',
  );
  await expect(page.getByRole('spinbutton', { name: /porcentaje/i }).first()).toHaveValue('');
});
```

**El instrumento sí se conserva entre periodos** —RF-PE-013 RN1 dice que es único por competencia— y el porcentaje no. Esa asimetría es justo lo que la prueba fija: si alguien la rompiera guardando el instrumento por periodo, esta prueba lo vería.

El segundo recorrido, con el plan ya en vigor:

```ts
test('un plan Vigente deja registrar lo alcanzado, no cambiar la definición', async ({ page }) => {
  // RF-PE-006 RN2. Es la mitad del submódulo: sin esta excepción, el porcentaje
  // alcanzado de un periodo que ya cerró no podría registrarse nunca.
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // Se lleva a Vigente por su ciclo de vida, sin tocar la base de datos: lo que
  // se prueba es lo que hace la aplicación, no lo que sabemos que guarda.
  for (const accion of ['Enviar a revisión', 'Aprobar', 'Marcar como vigente']) {
    await page.getByRole('button', { name: accion }).click();
    await expect(page.getByRole('button', { name: accion })).toHaveCount(0);
  }
  await expect(page.locator('main').getByText('Vigente', { exact: true }).first()).toBeVisible();

  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-I' });

  await expect(page.getByRole('spinbutton', { name: /porcentaje/i }).first()).toBeEnabled();
  await expect(page.getByRole('textbox', { name: /instrumento/i }).first()).toBeDisabled();
});
```

**Ese recorrido necesita la cuenta de director del Step 1.** El fixture usa
`e2e-editor` por defecto, que es Coordinador académico y **no tiene
`evaluacion.aprobar`** —quien construye no da el visto bueno, RF-PE-046—, así
que los botones «Aprobar» y «Marcar como vigente» ni siquiera se pintan.
Declara al principio del archivo, antes de ese `test`:

```ts
test.describe('con la cuenta que aprueba', () => {
  test.use({ rol: 'director' });

  // …el test de arriba va aquí dentro…
});
```

- [ ] **Step 3: Añadir la pantalla a la suite de accesibilidad**

En `tests/e2e/specs/accesibilidad.spec.ts`, ampliar el recorrido «el detalle de evaluación» para que además despliegue la configuración de un periodo antes de analizar, o añadir uno nuevo. Es exigencia de CLAUDE.md §6.6 y en 2c-A se olvidó — no se repite.

- [ ] **Step 4: Registrar D-13**

La errata de RF-PE-006 RN2: remite a «RF-PE-022 y RF-PE-028» como los requisitos de registro progresivo, y no lo son —son de la medición indirecta—. Los que sí lo describen son **RF-PE-019** y **RF-PE-026**. Leída literal, el plan directo no tendría excepción y nunca podría registrar lo alcanzado.

Añádela con el mismo formato que D-11 y D-12: fila en la tabla de §8 de `PROMPT_CLAUDE_CODE_PLAN_ESTUDIOS_UI.md` con su sección de detalle, y entrada en `CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md` con su fila en la tabla de prioridad. Actualiza los recuentos de la cabecera de ese archivo («once puntos» → «doce», «D-1 a D-12» → «D-13»).

- [ ] **Step 5: Actualizar el recuento**

En `CLAUDE.md`: `Mejora Continua · Evaluación (RF-PE)` pasa de `17 | 49` a `28 | 49`, el total de `137 de 243` a `148 de 243`, el porcentaje al **61 %**, y la fecha a la de hoy. Comprueba que la tabla siga sumando.

En `README.md`, sección «Estado», añade la configuración directa con las cifras que **midas**, no las del plan.

- [ ] **Step 6: Verificar todo y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
cd ../../tests/e2e && npm run typecheck && npm run format:check
# con la API y el worker compilados y arriba:
SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

**Antes de dar por bueno un recorrido nuevo, comprueba que no es vacuo:** rómpelo a propósito —por ejemplo, que la tarjeta de configuración no se pinte— y confirma que falla.

```bash
cd /d/App-ICACIT
git add tests/e2e apps/api/scripts docs README.md CLAUDE.md
git commit -m "La configuración directa, de punta a punta

Cierra 2c-B: 28 de los 49 RF-PE. Los recorridos fijan la asimetría que importa
—el instrumento se conserva entre periodos, el porcentaje no— y que un plan
Vigente deje registrar lo alcanzado sin dejar cambiar la definición.

D-13: RF-PE-006 RN2 concede la excepción del registro progresivo citando dos
requisitos de la medición indirecta que no la describen. Leída literal, el plan
directo no podría registrar nunca lo alcanzado."
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §2 las cuatro tablas y sus índices | Task 2 |
| §2 nulos, y la fila del cruce que se crea sola | Tasks 2 y 3 |
| §3 la frontera de estados en la forma de la API | Tasks 4 (guardianes) y 5 (endpoints) |
| §3 la errata D-13 | Task 7, Step 4 |
| §4 las validaciones | Task 4 (las de dominio), Task 2 (`CHECK` e índices), Task 5 (DTO) |
| §4 el docente no se valida contra su rol | Task 4, Step 4 |
| §5 los siete endpoints | Task 5 |
| §6 los dos puertos ampliados | Task 1 |
| §7 la pantalla | Task 6 |
| §8 los errores | Task 4 (dominio) y Task 5, Step 4 (HTTP) |
| §9 las pruebas, incluida la accesibilidad | Todas; la accesibilidad en Task 7, Step 3 |
| §11 el desplegable de docentes vacío | Task 7, Step 1 — se siembra uno para las pruebas |
