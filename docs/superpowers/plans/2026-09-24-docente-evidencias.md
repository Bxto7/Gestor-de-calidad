# Evidencias del docente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un Docente registre y retire enlaces de evidencia únicamente en las evaluaciones que tiene asignadas (planes de evaluación Vigentes de su carrera), sin tocar lo que registró un coordinador, y dejar listo el listado «mis evaluaciones» que reutilizará la vista de inicio del Docente (sub-proyecto 4b).

**Architecture:** Submódulo nuevo `mejora-continua/mis-evidencias/` (dominio, aplicación, infraestructura) con su propio puerto de lectura/escritura y un único adaptador Prisma, mismo molde que `resumen/`. La autoría de cada evidencia se guarda en una columna nueva (`registradaPorId`); un permiso nuevo `evidencia.registrar`, acotado a carrera, se asigna al rol Docente. El «guardar evidencias» del coordinador se mantiene y pasa a conservar la autoría de las filas que no cambia. En el frontend, una página `/mis-evidencias`.

**Tech Stack:** NestJS + Prisma 7 + Vitest (API); React 18 + TypeScript + `@tanstack/react-query` + Vitest/Testing Library (web); Playwright + axe-core (e2e).

**Spec:** `docs/superpowers/specs/2026-09-24-docente-evidencias-design.md`

## Rulings del plan (desvíos deliberados respecto al spec)

El spec es la autoridad; estos puntos son decisiones que el spec dejaba abiertas o que el código real obliga a resolver así. Cada uno lleva su costo si resultara equivocado.

1. **`ContextoDeEvaluacion` incluye `planCodigo`.** El spec no lo listaba, pero el evento de auditoría existente (`ConfiguracionEvaluacionCambiada`) necesita el código del plan para escribir «Plan de evaluación EV-1: …». *Costo:* ninguno.
2. **El e2e de accesibilidad cubre la página en su estado sin evaluaciones asignadas.** Sembrar un plan de evaluación Vigente con una evaluación del docente choca con `evaluacion_una_vigente_por_medicion` y con otras suites e2e que aprueban planes sobre la misma medición; además la cuenta del docente no existe todavía cuando corre `preparar-e2e`. El estado con datos se cubre con pruebas de componente (jsdom), que no incluyen axe. *Costo si es un error:* una violación de accesibilidad exclusiva del estado con datos no la detecta ninguna prueba automática; se ve en la revisión manual que §6.4 del CLAUDE.md ya pide.
3. **La confirmación de «Retirar» es en línea** (el botón pasa a «¿Retirar? Confirmar / Cancelar») y no un `Modal`, para que sea trivial de probar y no dependa de la gestión de foco del modal. *Costo:* si se prefiere modal, es un cambio de componente.
4. **Migración escrita a mano** (una línea `ALTER TABLE … ADD COLUMN`), no generada con `migrate dev`, para no depender de una base sombra ni tocar la base de desarrollo. Se valida aplicándola a `sgc_test` y comprobando que `prisma migrate status` queda al día. *Costo:* ninguno si el SQL coincide con lo que Prisma generaría; la tarea lo comprueba con `prisma migrate diff`.

## Global Constraints

- TypeScript estricto; `any` solo con comentario que lo justifique (CLAUDE.md §2). `noUncheckedIndexedAccess` está activo en ambos paquetes.
- `domain/` no importa NestJS, Prisma ni Express.
- **Aislamiento entre módulos (CLAUDE.md §3.1/§3.2):** `mejora-continua` solo importa de `plan-estudios` archivos de `application/ports/` (los permitidos por `mejora-continua/aislamiento.spec.ts`: `contenido-curricular.port.js`, `acreditacion-cross-modulo.port.js`, `plan-vigente.port.js`) y de `auth` solo `authorization.port.js` y `directorio-usuarios.port.js`. Este plan no añade ningún import nuevo entre módulos.
- **Reglas de autorización** (spec §4.2), comprobadas en este orden en `agregar` y `retirar`: la evaluación (o evidencia) existe; permiso `evidencia.registrar` sobre la carrera del plan; la evaluación es del actor (`docenteId === actor.id`); para `retirar`, la evidencia es del actor (`registradaPorId === actor.id`); el plan está `VIGENTE`; para `agregar`, `totalEvidencias < 20`. Si la evaluación o la evidencia no existe, o no es del usuario, siempre `AccesoDenegado` (un solo tipo, para no revelar si existe). Plan no vigente o tope alcanzado: `ReglaDeNegocioViolada` con mensaje para una persona.
- **Textos exactos:** «El plan de evaluación <código> no está vigente; ya no admite evidencias.» · «Esta evaluación ya tiene 20 evidencias.» · «Esta vista necesita una carrera asignada.» (409 sin carrera a cargo, igual que la vista del Director).
- Auditoría: reutilizar `ConfiguracionEvaluacionCambiada` (`evaluacion/domain/events/eventos-evaluacion.ts`) con el texto «evidencia registrada por el docente» / «evidencia retirada por el docente». No inventar un evento nuevo.
- Los enlaces de evidencia se validan con `EvidenciaDto` existente (`IsUrl({ require_protocol: true })`, 2000 y 200 caracteres). El frontend los abre con `target="_blank"` y `rel="noopener noreferrer"`.
- Colores: solo tokens existentes de `apps/web/src/styles/global.css`.
- Comentarios de código: solo el porqué no obvio, una línea. Textos de interfaz en español.
- Antes de cada commit, formatea lo que hayas creado o tocado (`npx prettier --write <archivos>` en `apps/api` o `apps/web`): `format:check` corre en CI.
- **Las pruebas de integración vacían tablas con `TRUNCATE`. Nunca se corren contra la base de desarrollo `sgc`.** Usan la base desechable `sgc_test`: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npm run test:integration -- <nombre>` desde `apps/api`. Nunca ejecutes migraciones ni el seed contra `sgc`.
- `npm run start:dev` (tsx) no sirve para arrancar la API (no emite metadatos de decoradores): para comprobar el arranque usa `npm run build` y luego `npm start` con `DATABASE_URL` de `sgc_test` y un `PORT` libre.
- Rutas de importación desde `src/modules/mejora-continua/mis-evidencias/…`: `application/use-cases/` sube cinco niveles a `src/` (`../../../../../shared-kernel/…`); `../../../../auth/…` y `../../../../plan-estudios/…` alcanzan otros módulos; `infrastructure/persistence/` sube cinco niveles a `src/` para `platform/database/prisma.service.js`.

## Review Focus

1. **Un docente no toca lo de otro.** Dos docentes de la misma carrera: cada uno ve y modifica solo sus evaluaciones y sus evidencias; un docente de otra carrera no puede tocar nada. Lo pinta la prueba de integración ensamblada (Task 6) y las del caso de uso (Task 5).
2. **El coordinador no destruye la autoría del docente.** Cuando el coordinador guarda su lista de evidencias, las filas sin cambios conservan `registradaPorId`; una fila nueva no la inventa; una fila que el coordinador quita, se quita. Lo pinta Task 4.
3. **Evaluación o evidencia inexistente o ajena → siempre `AccesoDenegado`**, nunca «no encontrado» (no revela si existe). Lo pinta Task 5.
4. **Plan que deja de estar vigente entre la carga y el envío:** agregar o retirar responde 409 con el mensaje esperado, y la pantalla recarga la lista en vez de quedarse con datos viejos. Lo pintan Task 5 (backend) y Task 8 (frontend).
5. **Docente sin carrera a cargo o sin plan vigente:** 409 con el mensaje esperado y lista vacía respectivamente, sin errores 500. Lo pintan Task 5 y Task 8.

---

### Task 1: Columna `registradaPorId`, permiso `evidencia.registrar` y su alcance por carrera

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (modelo `Evidencia`, ~línea 1108)
- Create: `apps/api/prisma/migrations/20260924190000_evidencia_registrada_por/migration.sql`
- Modify: `apps/api/prisma/seed.ts` (tabla `PERMISOS` ~línea 81 y lista de permisos del rol `DOCENTE` ~línea 288)
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts` (`PERMISOS_ACOTADOS_A_CARRERA`)
- Test: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces (lo usan Tasks 3, 4, 5 y 6): el campo Prisma `Evidencia.registradaPorId: string | null`; el permiso `evidencia.registrar` (acotado a carrera, asignado al rol `DOCENTE`).

- [ ] **Step 1: Escribir la prueba que falla (alcance del permiso)**

En `politica-de-autorizacion.spec.ts`, dentro de `describe('los permisos de mejora-continua se acotan a la carrera', …)`, añade este caso justo antes del `it('un permiso acotado sin carrera se deniega, no se asume', …)`:

```typescript
  it('evidencia.registrar se acota: registrar evidencias en la carrera de otro se deniega', () => {
    const d = puede(
      contexto(['evidencia.registrar'], 'carrera-A'),
      'evidencia.registrar',
      'carrera-B',
    );
    expect(d.permitido).toBe(false);
  });

  it('evidencia.registrar sobre la propia carrera se permite', () => {
    const d = puede(
      contexto(['evidencia.registrar'], 'carrera-A'),
      'evidencia.registrar',
      'carrera-A',
    );
    expect(d.permitido).toBe(true);
  });
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`): `npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
Expected: FAIL solo en «evidencia.registrar se acota…» (`expect(d.permitido).toBe(false)` recibe `true`: hoy el permiso no está acotado, así que la carrera ajena se permite). La prueba de la carrera propia ya pasa.

- [ ] **Step 3: Acotar el permiso**

En `politica-de-autorizacion.ts`, dentro del `Set` `PERMISOS_ACOTADOS_A_CARRERA`, añade al final de la sección de Mejora Continua (tras `'actas.aprobar',`):

```typescript
  // El docente registra evidencias solo en la carrera del plan de la
  // evaluación que le asignaron: es escritura, y esta lista existe para eso.
  'evidencia.registrar',
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
Expected: PASS.

- [ ] **Step 5: Añadir la columna al esquema**

En `apps/api/prisma/schema.prisma`, modelo `Evidencia`, tras el campo `orden`:

```prisma
  /// Quién la registró, si fue un docente por su cuenta. Nulo: la registró un
  /// coordinador o es anterior a este campo — el docente no puede retirarla.
  /// Sin clave foránea, como `docenteId` en `AsignaturaEvaluada`: el registro
  /// debe seguir siendo legible aunque la cuenta desaparezca.
  registradaPorId String? @map("registrada_por_id") @db.Uuid
```

- [ ] **Step 6: Escribir la migración**

Crea `apps/api/prisma/migrations/20260924190000_evidencia_registrada_por/migration.sql` con exactamente:

```sql
-- AlterTable
ALTER TABLE "mejora_continua"."evidencia" ADD COLUMN     "registrada_por_id" UUID;
```

- [ ] **Step 7: Validar el esquema, aplicar la migración a `sgc_test` y regenerar el cliente**

Desde `apps/api`, con la variable de la base desechable puesta en cada comando:

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npx prisma validate`
Expected: «The schema at prisma\schema.prisma is valid».

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npx prisma migrate deploy`
Expected: aplica `20260924190000_evidencia_registrada_por` y termina con «All migrations have been successfully applied».

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npx prisma migrate status`
Expected: «Database schema is up to date!».

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npx prisma generate`
Expected: «Generated Prisma Client».

Comprueba que el SQL escrito a mano coincide con el esquema: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: salida vacía o «-- This is an empty migration.» (sin diferencias entre la base migrada y el esquema). Si en tu versión de Prisma esa forma del comando no existe, usa `npx prisma migrate diff --help` para la equivalente (`--from-url`/`--to-schema-datamodel`) y compara igualmente contra `sgc_test`. Si aparece cualquier `ALTER`/`CREATE`, la migración no coincide: corrígela antes de seguir.

- [ ] **Step 8: Sembrar el permiso y asignarlo al Docente**

En `apps/api/prisma/seed.ts`:

1. En el arreglo `PERMISOS`, tras la fila `['evaluacion.aprobar', …]` (varias líneas, ~línea 84-88), añade:

```typescript
  [
    'evidencia.registrar',
    'Registrar evidencias de las evaluaciones que tiene asignadas',
    'mejora-continua',
  ],
```

2. En el objeto del rol `DOCENTE` (`codigo: 'DOCENTE'`, ~línea 288), añade `'evidencia.registrar',` a su lista `permisos`, tras `'evaluacion.leer',`:

```typescript
      'evaluacion.leer',
      // Registra las evidencias de las evaluaciones que le asignaron (spec de
      // evidencias del docente): escritura acotada a su carrera.
      'evidencia.registrar',
```

- [ ] **Step 9: Volver a sembrar `sgc_test` y comprobar que el Docente tiene el permiso**

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npx tsx prisma/seed.ts`
Expected: termina sin error e imprime el recuento de permisos por rol (DOCENTE con 14 en vez de 13).

Run: `docker exec sgc_postgres psql -U sgc -d sgc_test -c "select r.codigo, count(*) filter (where p.codigo='evidencia.registrar') as tiene from auth.roles r join auth.rol_permiso rp on rp.rol_id=r.id join auth.permisos p on p.id=rp.permiso_id group by r.codigo order by r.codigo;"`
Expected: `DOCENTE` con `tiene = 1` y todos los demás roles con `0`. (Es una consulta de solo lectura sobre `sgc_test`.)

- [ ] **Step 10: Suite completa, typecheck, lint y commit**

Run: `npx vitest run` → todo en verde.
Run: `npx tsc --noEmit && npx eslint src/modules/auth prisma/seed.ts` → sin errores.

```bash
git add apps/api/prisma/schema.prisma \
        apps/api/prisma/migrations/20260924190000_evidencia_registrada_por/migration.sql \
        apps/api/prisma/seed.ts \
        apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts \
        apps/api/src/modules/auth/domain/services/politica-de-autorizacion.spec.ts
git commit -m "feat(auth): permiso evidencia.registrar acotado a carrera y columna registradaPorId en Evidencia"
```

---

### Task 2: Función de dominio `armarMisEvaluaciones`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mis-evidencias/domain/services/mis-evaluaciones.ts`
- Test: `apps/api/src/modules/mejora-continua/mis-evidencias/domain/services/mis-evaluaciones.spec.ts`

**Interfaces:**
- Consumes: nada (dominio puro).
- Produces (los usan Tasks 3, 5 y 6; los nombres son exactos):
  - Constante `MAXIMO_EVIDENCIAS = 20`.
  - Tipos de entrada: `EvidenciaLeida`, `EvaluacionAsignada`, `NombreDe`.
  - Tipos de salida: `EvidenciaVista`, `EvaluacionVista`, `MisEvaluaciones`.
  - Función `armarMisEvaluaciones(entrada: EntradaMisEvaluaciones): MisEvaluaciones`, con `EntradaMisEvaluaciones = { actorId: string; evaluaciones: readonly EvaluacionAsignada[]; asignaturas: ReadonlyMap<string, NombreDe>; competencias: ReadonlyMap<string, NombreDe> }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/domain/services/mis-evaluaciones.spec.ts
import { describe, expect, it } from 'vitest';

import {
  armarMisEvaluaciones,
  MAXIMO_EVIDENCIAS,
  type EvaluacionAsignada,
  type EvidenciaLeida,
  type NombreDe,
} from './mis-evaluaciones.js';

const ACTOR = 'u-docente';

const nombre = (id: string, codigo: string, n: string): [string, NombreDe] => [
  id,
  { id, codigo, nombre: n },
];

const asignaturas = new Map<string, NombreDe>([
  nombre('a-bd', 'BD', 'Base de Datos'),
  nombre('a-ed', 'ED', 'Estructura de Datos'),
  nombre('a-rc', 'RC', 'Redes de Computadoras'),
]);
const competencias = new Map<string, NombreDe>([
  nombre('k1', 'CPE-01', 'Diseño de soluciones'),
  nombre('k2', 'CPE-02', 'Análisis de problemas'),
]);

const evidencia = (e: Partial<EvidenciaLeida> & { id: string }): EvidenciaLeida => ({
  enlace: `https://ejemplo.pe/${e.id}`,
  descripcion: `Evidencia ${e.id}`,
  registradaPorId: null,
  ...e,
});

const evaluacion = (e: Partial<EvaluacionAsignada> & { id: string }): EvaluacionAsignada => ({
  asignaturaId: 'a-bd',
  competenciaId: 'k1',
  entregable: 'Proyecto final',
  periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: new Date(Date.UTC(2026, 6, 15)) },
  planEvaluacion: { id: 'pe1', codigo: 'EV-1' },
  evidencias: [],
  ...e,
});

const armar = (evaluaciones: readonly EvaluacionAsignada[]) =>
  armarMisEvaluaciones({ actorId: ACTOR, evaluaciones, asignaturas, competencias }).evaluaciones;

describe('armarMisEvaluaciones — resolución de nombres', () => {
  it('pone el código y el nombre de la asignatura y de la competencia', () => {
    const [v] = armar([evaluacion({ id: 'e1', asignaturaId: 'a-rc', competenciaId: 'k2' })]);
    expect(v?.asignatura).toEqual({ id: 'a-rc', codigo: 'RC', nombre: 'Redes de Computadoras' });
    expect(v?.competencia).toEqual({ id: 'k2', codigo: 'CPE-02', nombre: 'Análisis de problemas' });
  });

  it('lo que ya no está en el plan se sigue mostrando con un nombre que no engaña', () => {
    const [v] = armar([
      evaluacion({ id: 'e1', asignaturaId: 'desconocida', competenciaId: 'desconocida' }),
    ]);
    expect(v?.asignatura).toEqual({
      id: 'desconocida',
      codigo: '—',
      nombre: 'Asignatura que ya no está en el plan',
    });
    expect(v?.competencia).toEqual({
      id: 'desconocida',
      codigo: '—',
      nombre: 'Competencia que ya no está en el plan',
    });
  });
});

describe('armarMisEvaluaciones — marcas de cada evidencia', () => {
  it('«propia» es cierta solo si la registró el actor', () => {
    const [v] = armar([
      evaluacion({
        id: 'e1',
        evidencias: [
          evidencia({ id: 'x1', registradaPorId: ACTOR }),
          evidencia({ id: 'x2', registradaPorId: 'otra-persona' }),
          evidencia({ id: 'x3', registradaPorId: null }),
        ],
      }),
    ]);
    expect(v?.evidencias.map((e) => [e.id, e.propia])).toEqual([
      ['x1', true],
      ['x2', false],
      ['x3', false],
    ]);
  });

  it('no filtra ni reordena las evidencias: llegan ya en su orden', () => {
    const [v] = armar([
      evaluacion({
        id: 'e1',
        evidencias: [evidencia({ id: 'b' }), evidencia({ id: 'a' })],
      }),
    ]);
    expect(v?.evidencias.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('no expone la autoría de otras personas: solo la marca propia', () => {
    const [v] = armar([
      evaluacion({ id: 'e1', evidencias: [evidencia({ id: 'x1', registradaPorId: 'otra' })] }),
    ]);
    expect(Object.keys(v?.evidencias[0] ?? {}).sort()).toEqual([
      'descripcion',
      'enlace',
      'id',
      'propia',
    ]);
  });
});

describe('armarMisEvaluaciones — puedeAgregar', () => {
  const conCantidad = (n: number) =>
    evaluacion({
      id: 'e1',
      evidencias: Array.from({ length: n }, (_, i) => evidencia({ id: `x${i}` })),
    });

  it('con menos del máximo puede agregar', () => {
    expect(armar([conCantidad(MAXIMO_EVIDENCIAS - 1)])[0]?.puedeAgregar).toBe(true);
    expect(armar([conCantidad(0)])[0]?.puedeAgregar).toBe(true);
  });

  it('con el máximo ya no puede', () => {
    expect(armar([conCantidad(MAXIMO_EVIDENCIAS)])[0]?.puedeAgregar).toBe(false);
  });
});

describe('armarMisEvaluaciones — fechas y orden', () => {
  it('la fecha de cierre sale como AAAA-MM-DD, y nula si no hay', () => {
    const r = armar([
      evaluacion({ id: 'e1' }),
      evaluacion({
        id: 'e2',
        periodo: { id: 'p2', etiqueta: '2026-II', fechaCierre: null },
      }),
    ]);
    expect(r.find((e) => e.id === 'e1')?.periodo.fechaCierre).toBe('2026-07-15');
    expect(r.find((e) => e.id === 'e2')?.periodo.fechaCierre).toBeNull();
  });

  it('ordena por código de asignatura, luego cierre (sin fecha al final), luego competencia', () => {
    const r = armar([
      evaluacion({
        id: 'sin-fecha',
        asignaturaId: 'a-bd',
        periodo: { id: 'p9', etiqueta: 'X', fechaCierre: null },
      }),
      evaluacion({ id: 'rc', asignaturaId: 'a-rc' }),
      evaluacion({
        id: 'bd-tarde',
        asignaturaId: 'a-bd',
        periodo: { id: 'p2', etiqueta: '2026-II', fechaCierre: new Date(Date.UTC(2026, 11, 18)) },
      }),
      evaluacion({ id: 'bd-k2', asignaturaId: 'a-bd', competenciaId: 'k2' }),
      evaluacion({ id: 'bd-k1', asignaturaId: 'a-bd', competenciaId: 'k1' }),
      evaluacion({ id: 'ed', asignaturaId: 'a-ed' }),
    ]);
    expect(r.map((e) => e.id)).toEqual(['bd-k1', 'bd-k2', 'bd-tarde', 'sin-fecha', 'ed', 'rc']);
  });

  it('desempata por id para que el orden sea determinista', () => {
    const r = armar([evaluacion({ id: 'z' }), evaluacion({ id: 'a' })]);
    expect(r.map((e) => e.id)).toEqual(['a', 'z']);
  });

  it('sin evaluaciones devuelve una lista vacía', () => {
    expect(armar([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`): `npx vitest run src/modules/mejora-continua/mis-evidencias/domain/services/mis-evaluaciones.spec.ts`
Expected: FAIL — no se puede resolver `./mis-evaluaciones.js`.

- [ ] **Step 3: Implementar la función**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/domain/services/mis-evaluaciones.ts
/**
 * Arma el listado «mis evaluaciones» del docente a partir de lo ya leído.
 *
 * Dominio puro: resuelve nombres, marca qué evidencias son del actor, decide si
 * aún admite más y ordena. La respuesta llega ordenada; el frontend no ordena.
 */

/** Tope de evidencias por evaluación, el mismo que el del coordinador (ArrayMaxSize del DTO). */
export const MAXIMO_EVIDENCIAS = 20;

export interface EvidenciaLeida {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
  readonly registradaPorId: string | null;
}

export interface EvaluacionAsignada {
  /** `AsignaturaEvaluada.id`. */
  readonly id: string;
  readonly asignaturaId: string;
  readonly competenciaId: string;
  readonly entregable: string;
  readonly periodo: { readonly id: string; readonly etiqueta: string; readonly fechaCierre: Date | null };
  readonly planEvaluacion: { readonly id: string; readonly codigo: string };
  readonly evidencias: readonly EvidenciaLeida[];
}

export interface NombreDe {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface EntradaMisEvaluaciones {
  readonly actorId: string;
  readonly evaluaciones: readonly EvaluacionAsignada[];
  readonly asignaturas: ReadonlyMap<string, NombreDe>;
  readonly competencias: ReadonlyMap<string, NombreDe>;
}

export interface EvidenciaVista {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
  readonly propia: boolean;
}

export interface EvaluacionVista {
  readonly id: string;
  readonly asignatura: NombreDe;
  readonly competencia: NombreDe;
  readonly entregable: string;
  /** `fechaCierre` como `AAAA-MM-DD`, o nula si el periodo no tiene. */
  readonly periodo: { readonly id: string; readonly etiqueta: string; readonly fechaCierre: string | null };
  readonly planEvaluacion: { readonly id: string; readonly codigo: string };
  readonly evidencias: readonly EvidenciaVista[];
  readonly puedeAgregar: boolean;
}

export interface MisEvaluaciones {
  readonly evaluaciones: readonly EvaluacionVista[];
}

// Lo que ya no está en el plan se sigue mostrando: ocultarlo dejaría al docente
// sin poder ver una evaluación que sí tiene asignada.
const asignaturaDesconocida = (id: string): NombreDe => ({
  id,
  codigo: '—',
  nombre: 'Asignatura que ya no está en el plan',
});
const competenciaDesconocida = (id: string): NombreDe => ({
  id,
  codigo: '—',
  nombre: 'Competencia que ya no está en el plan',
});

const fechaIso = (fecha: Date | null): string | null =>
  fecha ? fecha.toISOString().slice(0, 10) : null;

// Sin fecha de cierre va al final: no hay plazo que vigilar.
const marcaDeFecha = (fecha: Date | null): number =>
  fecha ? fecha.getTime() : Number.POSITIVE_INFINITY;

export function armarMisEvaluaciones(entrada: EntradaMisEvaluaciones): MisEvaluaciones {
  const vistas = entrada.evaluaciones.map((e) => ({
    origen: e,
    vista: {
      id: e.id,
      asignatura: entrada.asignaturas.get(e.asignaturaId) ?? asignaturaDesconocida(e.asignaturaId),
      competencia:
        entrada.competencias.get(e.competenciaId) ?? competenciaDesconocida(e.competenciaId),
      entregable: e.entregable,
      periodo: {
        id: e.periodo.id,
        etiqueta: e.periodo.etiqueta,
        fechaCierre: fechaIso(e.periodo.fechaCierre),
      },
      planEvaluacion: e.planEvaluacion,
      evidencias: e.evidencias.map((x) => ({
        id: x.id,
        enlace: x.enlace,
        descripcion: x.descripcion,
        propia: x.registradaPorId === entrada.actorId,
      })),
      puedeAgregar: e.evidencias.length < MAXIMO_EVIDENCIAS,
    } satisfies EvaluacionVista,
  }));

  vistas.sort(
    (a, b) =>
      a.vista.asignatura.codigo.localeCompare(b.vista.asignatura.codigo) ||
      marcaDeFecha(a.origen.periodo.fechaCierre) - marcaDeFecha(b.origen.periodo.fechaCierre) ||
      a.vista.competencia.codigo.localeCompare(b.vista.competencia.codigo) ||
      a.vista.id.localeCompare(b.vista.id),
  );

  return { evaluaciones: vistas.map((v) => v.vista) };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/modules/mejora-continua/mis-evidencias/domain/services/mis-evaluaciones.spec.ts`
Expected: PASS (todas). Nota sobre `marcaDeFecha`: dos fechas `Infinity` restan a `NaN`; en JavaScript `NaN || siguiente` evalúa el siguiente criterio, que es justo lo que se quiere (dos sin fecha empatan y siguen por competencia). La prueba «sin-fecha» lo cubre.

- [ ] **Step 5: Typecheck, lint y commit**

Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/mis-evidencias` → sin errores.

```bash
git add apps/api/src/modules/mejora-continua/mis-evidencias/domain/services/
git commit -m "feat(mejora-continua): función de dominio armarMisEvaluaciones"
```

---

### Task 3: Puerto `RepositorioMisEvidenciasPort` y su adaptador Prisma

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mis-evidencias/application/ports/mis-evidencias.port.ts`
- Create: `apps/api/src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.ts`
- Test: `apps/api/test/integration/mis-evidencias.int.spec.ts`

**Interfaces:**
- Consumes: de Task 1 el campo Prisma `Evidencia.registradaPorId`; de Task 2 los tipos `EvaluacionAsignada` y `EvidenciaLeida` (`../../domain/services/mis-evaluaciones.js`).
- Produces (los usan Tasks 5 y 6; nombres exactos):
  - `ContextoDeEvaluacion` = `{ asignaturaEvaluadaId: string; docenteId: string | null; planEvaluacionId: string; planCodigo: string; estadoPlan: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO'; planEstudiosId: string; totalEvidencias: number }`.
  - `ContextoDeEvidencia` = `ContextoDeEvaluacion & { evidenciaId: string; registradaPorId: string | null }`.
  - `RepositorioMisEvidenciasPort` con `evaluacionesDelDocente(docenteId, planEstudiosId)`, `contextoDeEvaluacion(asignaturaEvaluadaId)`, `contextoDeEvidencia(evidenciaId)`, `agregarEvidencia(asignaturaEvaluadaId, datos)`, `retirarEvidencia(evidenciaId)`.
  - `REPOSITORIO_MIS_EVIDENCIAS` (Symbol), `MisEvidenciasRepositoryPrisma`.

- [ ] **Step 1: Escribir la prueba de integración que falla**

```typescript
// apps/api/test/integration/mis-evidencias.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MisEvidenciasRepositoryPrisma } from '../../src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new MisEvidenciasRepositoryPrisma(prisma);

const DOCENTE = randomUUID();
const OTRO_DOCENTE = randomUUID();
const CMP = randomUUID();
const ASIG = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function planDeEstudios() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  return prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
}

/** Una evaluación asignada a `docenteId` en un plan de evaluación con el estado dado. */
async function evaluacion(opciones: {
  planEstudiosId: string;
  docenteId: string | null;
  estadoPlan?: 'BORRADOR' | 'VIGENTE' | 'HISTORICO';
  estadoMedicion?: 'APROBADO' | 'VIGENTE';
  tipo?: 'DIRECTA' | 'INDIRECTA';
  cierre?: Date | null;
}) {
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId: opciones.planEstudiosId,
      tipo: opciones.tipo ?? 'DIRECTA',
      codigo: `PM-${randomUUID().slice(0, 8)}`,
      meta: 0.7,
      estado: opciones.estadoMedicion ?? 'APROBADO',
    },
  });
  const periodo = await prisma.periodoMedicion.create({
    data: {
      planMedicionId: medicion.id,
      etiqueta: '2026-I',
      orden: 1,
      fechaCierre: opciones.cierre === undefined ? new Date('2026-07-15') : opciones.cierre,
    },
  });
  const plan = await prisma.planEvaluacion.create({
    data: {
      planMedicionId: medicion.id,
      codigo: `EV-${randomUUID().slice(0, 8)}`,
      estado: opciones.estadoPlan ?? 'VIGENTE',
    },
  });
  const cruce = await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId: CMP, periodoId: periodo.id },
  });
  const ae = await prisma.asignaturaEvaluada.create({
    data: {
      medicionAlcanzadaId: cruce.id,
      asignaturaId: ASIG,
      entregable: 'Proyecto final',
      docenteId: opciones.docenteId,
    },
  });
  return { plan, periodo, ae };
}

describe('evaluacionesDelDocente', () => {
  it('trae solo las evaluaciones del docente en planes de evaluación Vigentes de ese plan de estudios', async () => {
    const pe = await planDeEstudios();
    const otroPe = await planDeEstudios();
    const mia = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await evaluacion({ planEstudiosId: pe.id, docenteId: OTRO_DOCENTE });
    await evaluacion({ planEstudiosId: pe.id, docenteId: null });
    await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE, estadoPlan: 'BORRADOR' });
    await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE, estadoPlan: 'HISTORICO' });
    await evaluacion({ planEstudiosId: otroPe.id, docenteId: DOCENTE });

    const r = await repo.evaluacionesDelDocente(DOCENTE, pe.id);

    expect(r.map((e) => e.id)).toEqual([mia.ae.id]);
    expect(r[0]).toMatchObject({
      asignaturaId: ASIG,
      competenciaId: CMP,
      entregable: 'Proyecto final',
      planEvaluacion: { id: mia.plan.id, codigo: mia.plan.codigo },
      periodo: { id: mia.periodo.id, etiqueta: '2026-I', fechaCierre: new Date('2026-07-15') },
      evidencias: [],
    });
  });

  it('trae las evidencias en su orden, con su autoría', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await prisma.evidencia.createMany({
      data: [
        { asignaturaEvaluadaId: ae.id, enlace: 'https://b', descripcion: 'segunda', orden: 1, registradaPorId: DOCENTE },
        { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'primera', orden: 0, registradaPorId: null },
      ],
    });

    const [r] = await repo.evaluacionesDelDocente(DOCENTE, pe.id);

    expect(r?.evidencias.map((e) => [e.descripcion, e.registradaPorId])).toEqual([
      ['primera', null],
      ['segunda', DOCENTE],
    ]);
  });

  it('un periodo sin fecha de cierre viene con fechaCierre nula', async () => {
    const pe = await planDeEstudios();
    await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE, cierre: null });

    const [r] = await repo.evaluacionesDelDocente(DOCENTE, pe.id);

    expect(r?.periodo.fechaCierre).toBeNull();
  });

  it('sin evaluaciones asignadas devuelve una lista vacía', async () => {
    const pe = await planDeEstudios();
    expect(await repo.evaluacionesDelDocente(DOCENTE, pe.id)).toEqual([]);
  });
});

describe('contextoDeEvaluacion', () => {
  it('devuelve lo mínimo para autorizar: docente, plan, su estado, su plan de estudios y cuántas evidencias hay', async () => {
    const pe = await planDeEstudios();
    const { plan, ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'x', orden: 0 },
    });

    expect(await repo.contextoDeEvaluacion(ae.id)).toEqual({
      asignaturaEvaluadaId: ae.id,
      docenteId: DOCENTE,
      planEvaluacionId: plan.id,
      planCodigo: plan.codigo,
      estadoPlan: 'VIGENTE',
      planEstudiosId: pe.id,
      totalEvidencias: 1,
    });
  });

  it('devuelve null si la evaluación no existe', async () => {
    expect(await repo.contextoDeEvaluacion(randomUUID())).toBeNull();
  });
});

describe('contextoDeEvidencia', () => {
  it('devuelve el contexto de su evaluación más su propio id y su autoría', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    const ev = await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: ae.id,
        enlace: 'https://a',
        descripcion: 'x',
        orden: 0,
        registradaPorId: DOCENTE,
      },
    });

    const r = await repo.contextoDeEvidencia(ev.id);

    expect(r).toMatchObject({
      evidenciaId: ev.id,
      registradaPorId: DOCENTE,
      asignaturaEvaluadaId: ae.id,
      docenteId: DOCENTE,
      totalEvidencias: 1,
    });
  });

  it('devuelve null si la evidencia no existe', async () => {
    expect(await repo.contextoDeEvidencia(randomUUID())).toBeNull();
  });
});

describe('agregarEvidencia', () => {
  it('guarda la autoría y asigna orden = máximo actual + 1', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    await prisma.evidencia.createMany({
      data: [
        { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'a', orden: 0 },
        { asignaturaEvaluadaId: ae.id, enlace: 'https://b', descripcion: 'b', orden: 4 },
      ],
    });

    const { id } = await repo.agregarEvidencia(ae.id, {
      enlace: 'https://nueva',
      descripcion: 'nueva',
      registradaPorId: DOCENTE,
    });

    const fila = await prisma.evidencia.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({
      enlace: 'https://nueva',
      descripcion: 'nueva',
      orden: 5,
      registradaPorId: DOCENTE,
    });
  });

  it('la primera evidencia de una evaluación queda con orden 0', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });

    const { id } = await repo.agregarEvidencia(ae.id, {
      enlace: 'https://a',
      descripcion: 'a',
      registradaPorId: DOCENTE,
    });

    expect((await prisma.evidencia.findUniqueOrThrow({ where: { id } })).orden).toBe(0);
  });
});

describe('retirarEvidencia', () => {
  it('borra solo esa evidencia', async () => {
    const pe = await planDeEstudios();
    const { ae } = await evaluacion({ planEstudiosId: pe.id, docenteId: DOCENTE });
    const [a, b] = await Promise.all([
      prisma.evidencia.create({
        data: { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'a', orden: 0 },
      }),
      prisma.evidencia.create({
        data: { asignaturaEvaluadaId: ae.id, enlace: 'https://b', descripcion: 'b', orden: 1 },
      }),
    ]);

    await repo.retirarEvidencia(a.id);

    const quedan = await prisma.evidencia.findMany({ where: { asignaturaEvaluadaId: ae.id } });
    expect(quedan.map((e) => e.id)).toEqual([b.id]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`): `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npm run test:integration -- mis-evidencias`
Expected: FAIL — no se puede resolver `mis-evidencias.repository.js`.

- [ ] **Step 3: Escribir el puerto**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/application/ports/mis-evidencias.port.ts
/**
 * Lo que necesita `GestionarMisEvidencias` de la base.
 *
 * Puerto propio y no métodos nuevos del repositorio de configuración de
 * evaluación: ese puerto lo fingen varios archivos de prueba y ampliarlo
 * rompería su compilación por operaciones que solo usa este submódulo.
 */

import type { EvaluacionAsignada } from '../../domain/services/mis-evaluaciones.js';

/** Lo mínimo para autorizar una operación sobre una evaluación. */
export interface ContextoDeEvaluacion {
  readonly asignaturaEvaluadaId: string;
  readonly docenteId: string | null;
  readonly planEvaluacionId: string;
  readonly planCodigo: string;
  readonly estadoPlan: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
  /** Del plan de medición base: de ahí sale la carrera. */
  readonly planEstudiosId: string;
  readonly totalEvidencias: number;
}

export interface ContextoDeEvidencia extends ContextoDeEvaluacion {
  readonly evidenciaId: string;
  readonly registradaPorId: string | null;
}

export interface RepositorioMisEvidenciasPort {
  /**
   * Las evaluaciones del docente en planes de evaluación **Vigentes** de ese plan
   * de estudios, con sus evidencias en su orden.
   */
  evaluacionesDelDocente(
    docenteId: string,
    planEstudiosId: string,
  ): Promise<readonly EvaluacionAsignada[]>;

  contextoDeEvaluacion(asignaturaEvaluadaId: string): Promise<ContextoDeEvaluacion | null>;

  contextoDeEvidencia(evidenciaId: string): Promise<ContextoDeEvidencia | null>;

  /** Añade al final: `orden` = máximo actual + 1, en una transacción. */
  agregarEvidencia(
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string; registradaPorId: string },
  ): Promise<{ id: string }>;

  retirarEvidencia(evidenciaId: string): Promise<void>;
}

export const REPOSITORIO_MIS_EVIDENCIAS = Symbol('RepositorioMisEvidenciasPort');
```

- [ ] **Step 4: Escribir el adaptador Prisma**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  ContextoDeEvaluacion,
  ContextoDeEvidencia,
  RepositorioMisEvidenciasPort,
} from '../../application/ports/mis-evidencias.port.js';
import type { EvaluacionAsignada } from '../../domain/services/mis-evaluaciones.js';

/** Lo que hay que leer de una asignatura evaluada para armar su contexto. */
const SELECCION_CONTEXTO = {
  id: true,
  docenteId: true,
  _count: { select: { evidencias: true } },
  medicion: {
    select: {
      plan: {
        select: {
          id: true,
          codigo: true,
          estado: true,
          plan: { select: { planEstudiosId: true } },
        },
      },
    },
  },
} as const;

interface FilaContexto {
  id: string;
  docenteId: string | null;
  _count: { evidencias: number };
  medicion: {
    plan: {
      id: string;
      codigo: string;
      estado: ContextoDeEvaluacion['estadoPlan'];
      plan: { planEstudiosId: string };
    };
  };
}

function aContexto(fila: FilaContexto): ContextoDeEvaluacion {
  return {
    asignaturaEvaluadaId: fila.id,
    docenteId: fila.docenteId,
    planEvaluacionId: fila.medicion.plan.id,
    planCodigo: fila.medicion.plan.codigo,
    estadoPlan: fila.medicion.plan.estado,
    planEstudiosId: fila.medicion.plan.plan.planEstudiosId,
    totalEvidencias: fila._count.evidencias,
  };
}

@Injectable()
export class MisEvidenciasRepositoryPrisma implements RepositorioMisEvidenciasPort {
  constructor(private readonly prisma: PrismaService) {}

  async evaluacionesDelDocente(
    docenteId: string,
    planEstudiosId: string,
  ): Promise<readonly EvaluacionAsignada[]> {
    const filas = await this.prisma.asignaturaEvaluada.findMany({
      where: {
        docenteId,
        medicion: { plan: { estado: 'VIGENTE', plan: { planEstudiosId } } },
      },
      select: {
        id: true,
        asignaturaId: true,
        entregable: true,
        evidencias: {
          select: { id: true, enlace: true, descripcion: true, registradaPorId: true },
          orderBy: { orden: 'asc' },
        },
        medicion: {
          select: {
            competenciaId: true,
            periodoId: true,
            plan: { select: { id: true, codigo: true } },
          },
        },
      },
    });

    // El periodo es un UUID suelto (sin clave foránea): se resuelve aparte.
    const periodoIds = [...new Set(filas.map((f) => f.medicion.periodoId))];
    const periodos = await this.prisma.periodoMedicion.findMany({
      where: { id: { in: periodoIds } },
      select: { id: true, etiqueta: true, fechaCierre: true },
    });
    const periodoPorId = new Map(periodos.map((p) => [p.id, p]));

    return filas.map((f) => {
      const periodo = periodoPorId.get(f.medicion.periodoId);
      // Un periodo borrado no debe hacer desaparecer la evaluación asignada.
      return {
        id: f.id,
        asignaturaId: f.asignaturaId,
        competenciaId: f.medicion.competenciaId,
        entregable: f.entregable,
        periodo: {
          id: f.medicion.periodoId,
          etiqueta: periodo?.etiqueta ?? '—',
          fechaCierre: periodo?.fechaCierre ?? null,
        },
        planEvaluacion: f.medicion.plan,
        evidencias: f.evidencias,
      };
    });
  }

  async contextoDeEvaluacion(asignaturaEvaluadaId: string): Promise<ContextoDeEvaluacion | null> {
    const fila = await this.prisma.asignaturaEvaluada.findUnique({
      where: { id: asignaturaEvaluadaId },
      select: SELECCION_CONTEXTO,
    });
    return fila ? aContexto(fila as FilaContexto) : null;
  }

  async contextoDeEvidencia(evidenciaId: string): Promise<ContextoDeEvidencia | null> {
    const fila = await this.prisma.evidencia.findUnique({
      where: { id: evidenciaId },
      select: { id: true, registradaPorId: true, asignatura: { select: SELECCION_CONTEXTO } },
    });
    if (!fila) return null;
    return {
      ...aContexto(fila.asignatura as FilaContexto),
      evidenciaId: fila.id,
      registradaPorId: fila.registradaPorId,
    };
  }

  async agregarEvidencia(
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string; registradaPorId: string },
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const ultimo = await tx.evidencia.aggregate({
        where: { asignaturaEvaluadaId },
        _max: { orden: true },
      });
      return tx.evidencia.create({
        data: {
          asignaturaEvaluadaId,
          enlace: datos.enlace,
          descripcion: datos.descripcion,
          orden: (ultimo._max.orden ?? -1) + 1,
          registradaPorId: datos.registradaPorId,
        },
        select: { id: true },
      });
    });
  }

  async retirarEvidencia(evidenciaId: string): Promise<void> {
    await this.prisma.evidencia.delete({ where: { id: evidenciaId } });
  }
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npm run test:integration -- mis-evidencias`
Expected: PASS (todas). Si `tsc` protesta por los `as FilaContexto` (los tipos de Prisma para `estado` son un enum de Prisma, no el literal del puerto), el enum de Prisma `EstadoMedicion` tiene exactamente los mismos cinco literales; ajusta solo el tipo de la conversión, no las consultas, y déjalo dicho en tu informe.

- [ ] **Step 6: Typecheck, lint, suite unitaria y commit**

Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/mis-evidencias test/integration/mis-evidencias.int.spec.ts` → sin errores.
Run: `npx vitest run` → todo en verde.

```bash
git add apps/api/src/modules/mejora-continua/mis-evidencias/application/ports/mis-evidencias.port.ts \
        apps/api/src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.ts \
        apps/api/test/integration/mis-evidencias.int.spec.ts
git commit -m "feat(mejora-continua): puerto y adaptador Prisma de mis evidencias"
```

---

### Task 4: El «guardar evidencias» del coordinador conserva la autoría

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.ts` (método `reemplazarEvidencias`, ~línea 263)
- Test: `apps/api/test/integration/configuracion-evaluacion.int.spec.ts` (bloque `describe('el repositorio', …)`, tras la prueba «las evidencias conservan el orden en que llegaron»)

**Interfaces:**
- Consumes: de Task 1 el campo Prisma `Evidencia.registradaPorId`.
- Produces: nada nuevo (la firma `reemplazarEvidencias(asignaturaEvaluadaId, evidencias)` no cambia).

- [ ] **Step 1: Escribir las pruebas que fallan**

En `configuracion-evaluacion.int.spec.ts`, dentro de `describe('el repositorio', …)`, justo después de la prueba `'las evidencias conservan el orden en que llegaron'`, añade:

```typescript
  it('reemplazar conserva la autoría de las evidencias que no cambian', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;
    await prisma.evidencia.createMany({
      data: [
        { asignaturaEvaluadaId: ae.id, enlace: 'https://del-docente', descripcion: 'Del docente', orden: 0, registradaPorId: RESPONSABLE },
        { asignaturaEvaluadaId: ae.id, enlace: 'https://del-coordinador', descripcion: 'Del coordinador', orden: 1, registradaPorId: null },
      ],
    });

    // El coordinador reenvía la lista completa, con una evidencia nueva al final.
    await repo.reemplazarEvidencias(ae.id, [
      { enlace: 'https://del-docente', descripcion: 'Del docente' },
      { enlace: 'https://del-coordinador', descripcion: 'Del coordinador' },
      { enlace: 'https://nueva', descripcion: 'Nueva' },
    ]);

    const filas = await prisma.evidencia.findMany({
      where: { asignaturaEvaluadaId: ae.id },
      orderBy: { orden: 'asc' },
    });
    expect(filas.map((f) => [f.descripcion, f.registradaPorId])).toEqual([
      ['Del docente', RESPONSABLE],
      ['Del coordinador', null],
      // La nueva no hereda ninguna autoría: no la inventa.
      ['Nueva', null],
    ]);
  });

  it('reemplazar pierde la autoría si el coordinador cambia el enlace o la descripción', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;
    await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'Original', orden: 0, registradaPorId: RESPONSABLE },
    });

    await repo.reemplazarEvidencias(ae.id, [{ enlace: 'https://a', descripcion: 'Corregida' }]);

    const [fila] = await prisma.evidencia.findMany({ where: { asignaturaEvaluadaId: ae.id } });
    expect(fila?.descripcion).toBe('Corregida');
    expect(fila?.registradaPorId).toBeNull();
  });

  it('reemplazar quita las evidencias del docente que el coordinador ya no envía', async () => {
    const plan = await crearEvaluacion();
    await repo.reemplazarAsignaturas(plan.id, CMP1, PER1, [
      { asignaturaId: ASIG1, entregable: 'Proyecto', docenteId: null },
    ]);
    const { mediciones } = await repo.del(plan.id);
    const ae = mediciones[0]!.asignaturas[0]!;
    await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: ae.id, enlace: 'https://a', descripcion: 'Del docente', orden: 0, registradaPorId: RESPONSABLE },
    });

    await repo.reemplazarEvidencias(ae.id, []);

    expect(await prisma.evidencia.count({ where: { asignaturaEvaluadaId: ae.id } })).toBe(0);
  });
```

- [ ] **Step 2: Verificar que la primera falla y las otras dos son guardas**

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npm run test:integration -- configuracion-evaluacion`
Expected: FAIL solo en «reemplazar conserva la autoría de las evidencias que no cambian» (`registradaPorId` de «Del docente» sale `null` en vez de `RESPONSABLE`: hoy el reemplazo borra y recrea sin autoría). Las otras dos pruebas ya pasan antes de la corrección y quedan como guardas de regresión (que cambiar el texto pierde la autoría, y que quitar la evidencia la quita).

- [ ] **Step 3: Implementar la conservación**

Reemplaza el método `reemplazarEvidencias` completo en `configuracion-evaluacion.repository.ts` por:

```typescript
  async reemplazarEvidencias(
    asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Quien reenvía la lista completa (el coordinador) no debe convertir en
      // «ajenas» las evidencias que registró un docente: las filas que no
      // cambian conservan su autoría, la clave es el par enlace + descripción.
      const existentes = await tx.evidencia.findMany({
        where: { asignaturaEvaluadaId },
        select: { enlace: true, descripcion: true, registradaPorId: true },
      });
      const autoria = new Map<string, string | null>();
      for (const e of existentes) {
        const clave = `${e.enlace}\u0000${e.descripcion}`;
        if (!autoria.has(clave)) autoria.set(clave, e.registradaPorId);
      }

      await tx.evidencia.deleteMany({ where: { asignaturaEvaluadaId } });
      if (evidencias.length === 0) return;
      await tx.evidencia.createMany({
        data: evidencias.map((e, indice) => ({
          asignaturaEvaluadaId,
          enlace: e.enlace,
          descripcion: e.descripcion,
          orden: indice,
          registradaPorId: autoria.get(`${e.enlace}\u0000${e.descripcion}`) ?? null,
        })),
      });
    });
  }
```

- [ ] **Step 4: Verificar que pasa**

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npm run test:integration -- configuracion-evaluacion`
Expected: PASS (todas, incluidas las que ya existían).

- [ ] **Step 5: Comprobación por mutación de la prueba principal**

Rompe a propósito la conservación: en el `createMany` cambia `registradaPorId: autoria.get(...) ?? null` por `registradaPorId: null`, ejecuta la prueba del Step 4 y confirma que «reemplazar conserva la autoría de las evidencias que no cambian» falla. Deshaz el cambio (`git checkout -- <archivo>` desde la carpeta donde esté el archivo, o reescribe la línea) y confirma con `git diff` que solo queda la implementación buena.

- [ ] **Step 6: Suites, typecheck, lint y commit**

Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/evaluacion test/integration/configuracion-evaluacion.int.spec.ts` → sin errores.
Run: `npx vitest run` → todo en verde. Run la integración completa con la variable de `sgc_test` → todo en verde.

```bash
git add apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.ts \
        apps/api/test/integration/configuracion-evaluacion.int.spec.ts
git commit -m "feat(mejora-continua): el reemplazo de evidencias del coordinador conserva la autoría del docente"
```

---

### Task 5: Caso de uso `GestionarMisEvidencias`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.spec.ts`

**Interfaces:**
- Consumes: de Task 2 `armarMisEvaluaciones`, `MAXIMO_EVIDENCIAS`, `MisEvaluaciones`; de Task 3 `RepositorioMisEvidenciasPort`, `ContextoDeEvaluacion`, `ContextoDeEvidencia`; puertos existentes `AuthorizationPort`, `PlanVigenteDeCarreraPort` (`plan-estudios/application/ports/plan-vigente.port.ts`), `ContenidoCurricularPort` (métodos `planPorId`, `asignaturasDelPlan`, `competenciasDelPlan`); `PublicadorDeEventos`, `Actor` (`shared-kernel/domain-events/domain-event.js`); errores `AccesoDenegado`, `ReglaDeNegocioViolada` (`shared-kernel/errors/errores.js`); `ConfiguracionEvaluacionCambiada` (`../../../evaluacion/domain/events/eventos-evaluacion.js`, constructor `(actor, entidadId, codigo, que)`).
- Produces (los usa Task 6): `GestionarMisEvidencias` con `constructor(repositorio, planVigente, contenido, autorizacion, eventos)` y los métodos `listar(actor): Promise<MisEvaluaciones>`, `agregar(actor, asignaturaEvaluadaId, datos: { enlace: string; descripcion: string }): Promise<{ id: string }>`, `retirar(actor, evidenciaId): Promise<void>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.spec.ts
/* eslint-disable @typescript-eslint/unbound-method -- los `vi.fn` se leen por su método para afirmar sobre las llamadas */
import { describe, expect, it, vi } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import { MAXIMO_EVIDENCIAS } from '../../domain/services/mis-evaluaciones.js';
import type {
  ContextoDeEvaluacion,
  ContextoDeEvidencia,
  RepositorioMisEvidenciasPort,
} from '../ports/mis-evidencias.port.js';
import { GestionarMisEvidencias } from './gestionar-mis-evidencias.use-case.js';

const ACTOR: Actor = { id: 'u-docente', nombre: 'Jorge Huamán' };
const CARRERA = 'carrera-isi';

const contexto = (c: Partial<ContextoDeEvaluacion> = {}): ContextoDeEvaluacion => ({
  asignaturaEvaluadaId: 'ae-1',
  docenteId: ACTOR.id,
  planEvaluacionId: 'pev-1',
  planCodigo: 'EV-1',
  estadoPlan: 'VIGENTE',
  planEstudiosId: 'pe-1',
  totalEvidencias: 0,
  ...c,
});

const contextoEvidencia = (c: Partial<ContextoDeEvidencia> = {}): ContextoDeEvidencia => ({
  ...contexto(),
  evidenciaId: 'ev-1',
  registradaPorId: ACTOR.id,
  ...c,
});

interface Opciones {
  permitido?: boolean;
  carreraACargo?: string | null;
  planVigente?: { id: string; codigo: string; version: number; fechaVigencia: Date | null } | null;
  contextoEvaluacion?: ContextoDeEvaluacion | null;
  contextoDeLaEvidencia?: ContextoDeEvidencia | null;
  carreraDelPlan?: string | null;
}

function montar(o: Opciones = {}) {
  const opciones = {
    permitido: true,
    carreraACargo: CARRERA as string | null,
    planVigente: { id: 'pe-1', codigo: 'PE-1', version: 1, fechaVigencia: null },
    contextoEvaluacion: contexto() as ContextoDeEvaluacion | null,
    contextoDeLaEvidencia: contextoEvidencia() as ContextoDeEvidencia | null,
    carreraDelPlan: CARRERA as string | null,
    ...o,
  };

  const autorizacion: AuthorizationPort = {
    puede: vi.fn(async () =>
      opciones.permitido
        ? { permitido: true as const }
        : { permitido: false as const, motivo: 'no' },
    ),
    permisosDe: vi.fn(async () => new Set<string>()),
    carreraACargoDe: vi.fn(async () => opciones.carreraACargo),
    rolesDe: vi.fn(async () => []),
  };
  const repositorio: RepositorioMisEvidenciasPort = {
    evaluacionesDelDocente: vi.fn(async () => []),
    contextoDeEvaluacion: vi.fn(async () => opciones.contextoEvaluacion),
    contextoDeEvidencia: vi.fn(async () => opciones.contextoDeLaEvidencia),
    agregarEvidencia: vi.fn(async () => ({ id: 'nueva' })),
    retirarEvidencia: vi.fn(async () => undefined),
  };
  const planVigente: PlanVigenteDeCarreraPort = {
    planVigenteDeCarrera: vi.fn(async () => opciones.planVigente),
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: vi.fn(async () => []),
    planPorId: vi.fn(async () =>
      opciones.carreraDelPlan
        ? {
            id: 'pe-1',
            codigo: 'PE-1',
            carreraId: opciones.carreraDelPlan,
            carreraNombre: 'Sistemas',
            version: 1,
            elegible: true,
            duracionAnios: 5,
          }
        : null,
    ),
    competenciasDelPlan: vi.fn(async () => []),
    asignaturasDelPlan: vi.fn(async () => []),
    carreraPorId: vi.fn(async () => null),
  };
  const eventos: PublicadorDeEventos = { publicar: vi.fn(async () => undefined) };

  const caso = new GestionarMisEvidencias(repositorio, planVigente, contenido, autorizacion, eventos);
  return { caso, autorizacion, repositorio, planVigente, contenido, eventos };
}

const DATOS = { enlace: 'https://ejemplo.pe/acta', descripcion: 'Acta firmada' };

describe('listar', () => {
  it('sin el permiso evaluacion.leer lanza AccesoDenegado y no lee nada', async () => {
    const { caso, autorizacion, repositorio } = montar({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.leer', null);
    expect(autorizacion.carreraACargoDe).not.toHaveBeenCalled();
    expect(repositorio.evaluacionesDelDocente).not.toHaveBeenCalled();
  });

  it('sin carrera a cargo lanza el 409 con el mensaje esperado', async () => {
    const { caso } = montar({ carreraACargo: null });
    const fallo = await caso.listar(ACTOR).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta vista necesita una carrera asignada.');
  });

  it('sin plan de estudios vigente devuelve una lista vacía y no consulta evaluaciones', async () => {
    const { caso, repositorio } = montar({ planVigente: null });
    expect(await caso.listar(ACTOR)).toEqual({ evaluaciones: [] });
    expect(repositorio.evaluacionesDelDocente).not.toHaveBeenCalled();
  });

  it('lee las evaluaciones del propio actor en el plan vigente de su carrera y resuelve nombres', async () => {
    const { caso, repositorio, planVigente, contenido } = montar();
    vi.mocked(repositorio.evaluacionesDelDocente).mockResolvedValue([
      {
        id: 'ae-1',
        asignaturaId: 'a1',
        competenciaId: 'k1',
        entregable: 'Proyecto final',
        periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: new Date(Date.UTC(2026, 6, 15)) },
        planEvaluacion: { id: 'pev-1', codigo: 'EV-1' },
        evidencias: [{ id: 'x1', enlace: 'https://a', descripcion: 'a', registradaPorId: ACTOR.id }],
      },
    ]);
    vi.mocked(contenido.asignaturasDelPlan).mockResolvedValue([
      { id: 'a1', codigo: 'BD', nombre: 'Base de Datos', cicloNumero: 5, activa: true },
    ]);
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Diseño de soluciones', activa: true, atributos: [] },
    ]);

    const r = await caso.listar(ACTOR);

    expect(planVigente.planVigenteDeCarrera).toHaveBeenCalledWith(CARRERA);
    expect(repositorio.evaluacionesDelDocente).toHaveBeenCalledWith(ACTOR.id, 'pe-1');
    expect(r.evaluaciones[0]).toMatchObject({
      id: 'ae-1',
      asignatura: { codigo: 'BD', nombre: 'Base de Datos' },
      competencia: { codigo: 'CPE-01' },
      puedeAgregar: true,
    });
    expect(r.evaluaciones[0]?.evidencias[0]?.propia).toBe(true);
  });
});

describe('agregar', () => {
  it('camino feliz: agrega con la autoría del actor y deja constancia', async () => {
    const { caso, repositorio, eventos } = montar();

    const r = await caso.agregar(ACTOR, 'ae-1', DATOS);

    expect(r).toEqual({ id: 'nueva' });
    expect(repositorio.agregarEvidencia).toHaveBeenCalledWith('ae-1', {
      ...DATOS,
      registradaPorId: ACTOR.id,
    });
    expect(eventos.publicar).toHaveBeenCalledTimes(1);
    const [evento] = vi.mocked(eventos.publicar).mock.calls[0]![0];
    expect(evento).toMatchObject({
      nombre: 'evaluacion.configurada',
      entidadId: 'pev-1',
      detalle: 'Plan de evaluación EV-1: evidencia registrada por el docente.',
    });
  });

  it('una evaluación inexistente es AccesoDenegado, no «no encontrado»', async () => {
    const { caso, repositorio } = montar({ contextoEvaluacion: null });
    await expect(caso.agregar(ACTOR, 'ae-x', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('sin el permiso evidencia.registrar sobre la carrera del plan es AccesoDenegado', async () => {
    const { caso, autorizacion, repositorio } = montar({ permitido: false });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, 'evidencia.registrar', CARRERA);
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('una evaluación de otro docente es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({ contextoEvaluacion: contexto({ docenteId: 'otro' }) });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('una evaluación sin docente asignado es AccesoDenegado', async () => {
    const { caso } = montar({ contextoEvaluacion: contexto({ docenteId: null }) });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it.each(['BORRADOR', 'EN_REVISION', 'APROBADO', 'HISTORICO'] as const)(
    'con el plan en %s responde 409 con el mensaje de plan no vigente',
    async (estadoPlan) => {
      const { caso, repositorio } = montar({ contextoEvaluacion: contexto({ estadoPlan }) });
      const fallo = await caso.agregar(ACTOR, 'ae-1', DATOS).catch((e: unknown) => e);
      expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
      expect((fallo as Error).message).toBe(
        'El plan de evaluación EV-1 no está vigente; ya no admite evidencias.',
      );
      expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
    },
  );

  it('con el tope alcanzado responde 409 con el mensaje del tope', async () => {
    const { caso, repositorio } = montar({
      contextoEvaluacion: contexto({ totalEvidencias: MAXIMO_EVIDENCIAS }),
    });
    const fallo = await caso.agregar(ACTOR, 'ae-1', DATOS).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta evaluación ya tiene 20 evidencias.');
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('con una menos que el tope todavía agrega', async () => {
    const { caso, repositorio } = montar({
      contextoEvaluacion: contexto({ totalEvidencias: MAXIMO_EVIDENCIAS - 1 }),
    });
    await caso.agregar(ACTOR, 'ae-1', DATOS);
    expect(repositorio.agregarEvidencia).toHaveBeenCalled();
  });

  it('si el plan de estudios ya no existe es AccesoDenegado', async () => {
    const { caso } = montar({ carreraDelPlan: null });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('retirar', () => {
  it('camino feliz: retira la evidencia propia y deja constancia', async () => {
    const { caso, repositorio, eventos } = montar();

    await caso.retirar(ACTOR, 'ev-1');

    expect(repositorio.retirarEvidencia).toHaveBeenCalledWith('ev-1');
    const [evento] = vi.mocked(eventos.publicar).mock.calls[0]![0];
    expect(evento).toMatchObject({
      detalle: 'Plan de evaluación EV-1: evidencia retirada por el docente.',
    });
  });

  it('una evidencia inexistente es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({ contextoDeLaEvidencia: null });
    await expect(caso.retirar(ACTOR, 'ev-x')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('una evidencia registrada por otra persona es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ registradaPorId: 'otra-persona' }),
    });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('una evidencia sin autoría (la registró un coordinador) es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ registradaPorId: null }),
    });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('una evidencia propia en una evaluación que ya no es del actor es AccesoDenegado', async () => {
    const { caso } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ docenteId: 'otro' }),
    });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('sin el permiso evidencia.registrar es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({ permitido: false });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('con el plan que dejó de estar vigente responde 409', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ estadoPlan: 'HISTORICO' }),
    });
    const fallo = await caso.retirar(ACTOR, 'ev-1').catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('retirar no aplica el tope de evidencias', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ totalEvidencias: MAXIMO_EVIDENCIAS }),
    });
    await caso.retirar(ACTOR, 'ev-1');
    expect(repositorio.retirarEvidencia).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`): `npx vitest run src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.spec.ts`
Expected: FAIL — no se puede resolver `gestionar-mis-evidencias.use-case.js`.

- [ ] **Step 3: Implementar el caso de uso**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.ts
import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import { ConfiguracionEvaluacionCambiada } from '../../../evaluacion/domain/events/eventos-evaluacion.js';
import {
  armarMisEvaluaciones,
  MAXIMO_EVIDENCIAS,
  type MisEvaluaciones,
  type NombreDe,
} from '../../domain/services/mis-evaluaciones.js';
import type {
  ContextoDeEvaluacion,
  RepositorioMisEvidenciasPort,
} from '../ports/mis-evidencias.port.js';

/**
 * Las evidencias que un docente registra en sus propias evaluaciones.
 *
 * Toda operación sobre una evaluación o una evidencia responde `AccesoDenegado`
 * cuando falla por «no existe» o «no es tuya»: un solo tipo, para que la
 * respuesta no diga a quien no debe si el recurso existe.
 */
export class GestionarMisEvidencias {
  constructor(
    private readonly repositorio: RepositorioMisEvidenciasPort,
    private readonly planVigente: PlanVigenteDeCarreraPort,
    private readonly contenido: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async listar(actor: Actor): Promise<MisEvaluaciones> {
    const decision = await this.autorizacion.puede(actor.id, 'evaluacion.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) throw new ReglaDeNegocioViolada('Esta vista necesita una carrera asignada.');

    const plan = await this.planVigente.planVigenteDeCarrera(carreraId);
    if (!plan) return { evaluaciones: [] };

    const [evaluaciones, asignaturas, competencias] = await Promise.all([
      this.repositorio.evaluacionesDelDocente(actor.id, plan.id),
      this.contenido.asignaturasDelPlan(plan.id),
      this.contenido.competenciasDelPlan(plan.id),
    ]);

    return armarMisEvaluaciones({
      actorId: actor.id,
      evaluaciones,
      asignaturas: new Map<string, NombreDe>(asignaturas.map((a) => [a.id, a])),
      competencias: new Map<string, NombreDe>(competencias.map((c) => [c.id, c])),
    });
  }

  async agregar(
    actor: Actor,
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string },
  ): Promise<{ id: string }> {
    const contexto = await this.repositorio.contextoDeEvaluacion(asignaturaEvaluadaId);
    if (!contexto) throw new AccesoDenegado('No puedes registrar evidencias en esta evaluación.');

    await this.exigirPropia(actor, contexto);
    this.exigirVigente(contexto);
    if (contexto.totalEvidencias >= MAXIMO_EVIDENCIAS) {
      throw new ReglaDeNegocioViolada(`Esta evaluación ya tiene ${MAXIMO_EVIDENCIAS} evidencias.`);
    }

    const creada = await this.repositorio.agregarEvidencia(asignaturaEvaluadaId, {
      enlace: datos.enlace,
      descripcion: datos.descripcion,
      registradaPorId: actor.id,
    });
    await this.dejarConstancia(actor, contexto, 'evidencia registrada por el docente');
    return creada;
  }

  async retirar(actor: Actor, evidenciaId: string): Promise<void> {
    const contexto = await this.repositorio.contextoDeEvidencia(evidenciaId);
    if (!contexto) throw new AccesoDenegado('No puedes retirar esta evidencia.');

    await this.exigirPropia(actor, contexto);
    // La evidencia sin autoría la registró un coordinador: el docente no la retira.
    if (contexto.registradaPorId !== actor.id) {
      throw new AccesoDenegado('No puedes retirar esta evidencia.');
    }
    this.exigirVigente(contexto);

    await this.repositorio.retirarEvidencia(evidenciaId);
    await this.dejarConstancia(actor, contexto, 'evidencia retirada por el docente');
  }

  /** Permiso sobre la carrera del plan y evaluación asignada al actor. */
  private async exigirPropia(actor: Actor, contexto: ContextoDeEvaluacion): Promise<void> {
    const plan = await this.contenido.planPorId(contexto.planEstudiosId);
    if (!plan) throw new AccesoDenegado('No puedes registrar evidencias en esta evaluación.');

    const decision = await this.autorizacion.puede(actor.id, 'evidencia.registrar', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    if (contexto.docenteId !== actor.id) {
      throw new AccesoDenegado('Esta evaluación no está asignada a ti.');
    }
  }

  /** Solo donde el plan ya rige: un plan aún sin vigencia o ya histórico no admite evidencias del docente. */
  private exigirVigente(contexto: ContextoDeEvaluacion): void {
    if (contexto.estadoPlan !== 'VIGENTE') {
      throw new ReglaDeNegocioViolada(
        `El plan de evaluación ${contexto.planCodigo} no está vigente; ya no admite evidencias.`,
      );
    }
  }

  private async dejarConstancia(
    actor: Actor,
    contexto: ContextoDeEvaluacion,
    que: string,
  ): Promise<void> {
    await this.eventos.publicar([
      new ConfiguracionEvaluacionCambiada(
        actor,
        contexto.planEvaluacionId,
        contexto.planCodigo,
        que,
      ),
    ]);
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/modules/mejora-continua/mis-evidencias`
Expected: PASS (dominio + caso de uso). El fake `puede` de la prueba deniega todas las comprobaciones de permiso cuando `permitido` es falso.

- [ ] **Step 5: Typecheck, lint, guardia de aislamiento y commit**

Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/mis-evidencias` → sin errores.
Run: `npx vitest run src/modules/mejora-continua/aislamiento.spec.ts` → PASS (este archivo solo importa de otros módulos los puertos ya permitidos).
Run: `npx vitest run` → todo en verde.

```bash
git add apps/api/src/modules/mejora-continua/mis-evidencias/application/use-cases/
git commit -m "feat(mejora-continua): caso de uso GestionarMisEvidencias"
```

---

### Task 6: Controller, cableado en `app.module.ts` y prueba de integración ensamblada

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mis-evidencias/infrastructure/http/mis-evidencias.controller.ts`
- Modify: `apps/api/src/app.module.ts` (imports arriba; `controllers:` junto a `ResumenCarreraController`; `providers:` junto a `LECTURA_RESUMEN_CARRERA` y la fábrica de `ConsultarResumenDeCarrera`)
- Test: `apps/api/test/integration/mis-evidencias-caso-de-uso.int.spec.ts`

**Interfaces:**
- Consumes: `GestionarMisEvidencias` (Task 5), `MisEvidenciasRepositoryPrisma` y `REPOSITORIO_MIS_EVIDENCIAS` (Task 3), `PLAN_VIGENTE_DE_CARRERA` / `PlanVigenteAdapter` (ya en `app.module.ts`, plan del Director), `CONTENIDO_CURRICULAR`, `AUTHORIZATION_PORT`, `PUBLICADOR_EVENTOS`, `ActorActual` (`auth/infrastructure/http/jwt.guard.js`), `EvidenciaDto` (`evaluacion/infrastructure/http/dto/configuracion-evaluacion.dto.js`).
- Produces (los usa Task 7): `GET /mejora-continua/mis-evaluaciones`, `POST /mejora-continua/mis-evaluaciones/:id/evidencias` (`201 { id }`), `DELETE /mejora-continua/mis-evaluaciones/evidencias/:evidenciaId` (`204`).

- [ ] **Step 1: Escribir la prueba de integración ensamblada que falla**

Usa los adaptadores reales de Prisma y falsea solo la autorización, el puerto curricular y el publicador. Fija los Review Focus 1, 3 y 4.

```typescript
// apps/api/test/integration/mis-evidencias-caso-de-uso.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorizationPort } from '../../src/modules/auth/application/ports/authorization.port.js';
import { GestionarMisEvidencias } from '../../src/modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.js';
import { MisEvidenciasRepositoryPrisma } from '../../src/modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.js';
import type { ContenidoCurricularPort } from '../../src/modules/plan-estudios/application/ports/contenido-curricular.port.js';
import { PlanVigenteAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();

const ANA = { id: randomUUID(), nombre: 'Ana' };
const LUIS = { id: randomUUID(), nombre: 'Luis' };
const OTRA_CARRERA_DOCENTE = { id: randomUUID(), nombre: 'Rosa' };
const ASIG = randomUUID();
const CMP = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface CarreraDePrueba {
  carreraId: string;
  planEstudiosId: string;
}

async function carreraConPlan(): Promise<CarreraDePrueba> {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  return { carreraId: carrera.id, planEstudiosId: plan.id };
}

async function evaluacionDe(
  planEstudiosId: string,
  docenteId: string,
  estadoPlan: 'VIGENTE' | 'HISTORICO' = 'VIGENTE',
) {
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: `PM-${randomUUID().slice(0, 8)}`,
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  const periodo = await prisma.periodoMedicion.create({
    data: { planMedicionId: medicion.id, etiqueta: '2026-I', orden: 1 },
  });
  const plan = await prisma.planEvaluacion.create({
    data: {
      planMedicionId: medicion.id,
      codigo: `EV-${randomUUID().slice(0, 8)}`,
      estado: estadoPlan,
    },
  });
  const cruce = await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId: CMP, periodoId: periodo.id },
  });
  return prisma.asignaturaEvaluada.create({
    data: { medicionAlcanzadaId: cruce.id, asignaturaId: ASIG, entregable: 'Proyecto', docenteId },
  });
}

/**
 * Autorización que imita la política real: cada usuario tiene la carrera que se le
 * dio y `evidencia.registrar` solo vale sobre esa carrera.
 */
function montar(carreras: Record<string, string | null>, planes: Record<string, CarreraDePrueba>) {
  const autorizacion: AuthorizationPort = {
    puede: async (usuarioId, permiso, carreraId) => {
      if (permiso === 'evaluacion.leer') return { permitido: true };
      const propia = carreras[usuarioId] ?? null;
      return propia !== null && propia === carreraId
        ? { permitido: true }
        : { permitido: false, motivo: 'fuera de su carrera' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async (usuarioId) => carreras[usuarioId] ?? null,
    rolesDe: async () => [],
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: async () => [],
    planPorId: async (id) => {
      const encontrada = Object.values(planes).find((p) => p.planEstudiosId === id);
      return encontrada
        ? {
            id,
            codigo: 'PE',
            carreraId: encontrada.carreraId,
            carreraNombre: 'Sistemas',
            version: 1,
            elegible: true,
            duracionAnios: 5,
          }
        : null;
    },
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => null,
  };
  const eventos = { publicar: vi.fn(async () => undefined) };
  const caso = new GestionarMisEvidencias(
    new MisEvidenciasRepositoryPrisma(prisma),
    new PlanVigenteAdapter(prisma),
    contenido,
    autorizacion,
    eventos,
  );
  return { caso, eventos };
}

const DATOS = { enlace: 'https://ejemplo.pe/acta', descripcion: 'Acta firmada' };

describe('GestionarMisEvidencias contra la base real', () => {
  it('cada docente ve solo sus evaluaciones y sus evidencias', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const deLuis = await evaluacionDe(isi.planEstudiosId, LUIS.id);
    const { caso } = montar({ [ANA.id]: isi.carreraId, [LUIS.id]: isi.carreraId }, { isi });

    await caso.agregar(ANA, deAna.id, DATOS);
    await caso.agregar(LUIS, deLuis.id, { enlace: 'https://ejemplo.pe/otra', descripcion: 'Otra' });

    const verAna = await caso.listar(ANA);
    const verLuis = await caso.listar(LUIS);

    expect(verAna.evaluaciones.map((e) => e.id)).toEqual([deAna.id]);
    expect(verAna.evaluaciones[0]?.evidencias.map((e) => e.descripcion)).toEqual(['Acta firmada']);
    expect(verAna.evaluaciones[0]?.evidencias[0]?.propia).toBe(true);
    expect(verLuis.evaluaciones.map((e) => e.id)).toEqual([deLuis.id]);
    expect(verLuis.evaluaciones[0]?.evidencias.map((e) => e.descripcion)).toEqual(['Otra']);
  });

  it('un docente no puede agregar ni retirar en la evaluación de otro (AccesoDenegado)', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const { caso } = montar({ [ANA.id]: isi.carreraId, [LUIS.id]: isi.carreraId }, { isi });
    const { id: evidenciaDeAna } = await caso.agregar(ANA, deAna.id, DATOS);

    await expect(caso.agregar(LUIS, deAna.id, DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(caso.retirar(LUIS, evidenciaDeAna)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.evidencia.count()).toBe(1);
  });

  it('un docente de otra carrera no puede tocar nada, ni siquiera lo que se le asigna por error', async () => {
    const isi = await carreraConPlan();
    const otra = await carreraConPlan();
    // La evaluación está en un plan de la carrera ISI pero se le asignó a Rosa, de otra carrera.
    const asignadaPorError = await evaluacionDe(isi.planEstudiosId, OTRA_CARRERA_DOCENTE.id);
    const { caso } = montar({ [OTRA_CARRERA_DOCENTE.id]: otra.carreraId }, { isi, otra });

    await expect(
      caso.agregar(OTRA_CARRERA_DOCENTE, asignadaPorError.id, DATOS),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.evidencia.count()).toBe(0);
  });

  it('no puede retirar las evidencias que registró un coordinador (sin autoría)', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const delCoordinador = await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: deAna.id,
        enlace: 'https://ejemplo.pe/coordinador',
        descripcion: 'Del coordinador',
        orden: 0,
        registradaPorId: null,
      },
    });
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });

    await expect(caso.retirar(ANA, delCoordinador.id)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await prisma.evidencia.count()).toBe(1);
  });

  it('retira la evidencia propia y solo esa', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const coordinador = await prisma.evidencia.create({
      data: { asignaturaEvaluadaId: deAna.id, enlace: 'https://c', descripcion: 'C', orden: 0 },
    });
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });
    const { id } = await caso.agregar(ANA, deAna.id, DATOS);

    await caso.retirar(ANA, id);

    const quedan = await prisma.evidencia.findMany();
    expect(quedan.map((e) => e.id)).toEqual([coordinador.id]);
  });

  it('cuando el plan pasa a Histórico, agregar y retirar responden 409 y no tocan nada', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });
    const { id } = await caso.agregar(ANA, deAna.id, DATOS);

    // Entre que la pantalla cargó y el envío, el plan de evaluación deja de regir.
    await prisma.planEvaluacion.updateMany({ data: { estado: 'HISTORICO' } });

    await expect(caso.agregar(ANA, deAna.id, DATOS)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    await expect(caso.retirar(ANA, id)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.evidencia.count()).toBe(1);
  });

  it('el docente sin carrera a cargo recibe el 409 esperado al listar', async () => {
    const { caso } = montar({}, {});
    const fallo = await caso.listar(ANA).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta vista necesita una carrera asignada.');
  });

  it('una carrera sin plan vigente lista vacío, sin fallar', async () => {
    const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
    const carrera = await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Nueva', codigo: `N${randomUUID().slice(0, 6)}`, duracionAnios: 5 },
    });
    const { caso } = montar({ [ANA.id]: carrera.id }, {});

    expect(await caso.listar(ANA)).toEqual({ evaluaciones: [] });
  });

  it('el tope de 20 evidencias se aplica sobre la base real', async () => {
    const isi = await carreraConPlan();
    const deAna = await evaluacionDe(isi.planEstudiosId, ANA.id);
    await prisma.evidencia.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        asignaturaEvaluadaId: deAna.id,
        enlace: `https://ejemplo.pe/${i}`,
        descripcion: `E${i}`,
        orden: i,
      })),
    });
    const { caso } = montar({ [ANA.id]: isi.carreraId }, { isi });

    await expect(caso.agregar(ANA, deAna.id, DATOS)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(await prisma.evidencia.count()).toBe(20);
  });
});
```

- [ ] **Step 2: Verificar el estado de la prueba**

Run: `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' npm run test:integration -- mis-evidencias-caso-de-uso`
Expected: **PASS**. No hay paso rojo aquí, a propósito: esta prueba no añade código de producción, solo ensambla las piezas de Tasks 2–5 contra la base real, y el controller que viene es glue sin lógica (su prueba es el arranque de la aplicación en el Step 6). Si falla, hay un desajuste real entre el adaptador y el caso de uso que debe resolverse antes de cablear HTTP.

- [ ] **Step 3: Comprobación por mutación del aislamiento**

Rompe a propósito la regla de propiedad en `gestionar-mis-evidencias.use-case.ts`: en `exigirPropia`, comenta el `if (contexto.docenteId !== actor.id) { throw … }`. Ejecuta la prueba del Step 2 y confirma que fallan «un docente no puede agregar ni retirar en la evaluación de otro» (y la de la carrera equivocada solo si el permiso también lo permitiera). Revierte el cambio (`git checkout -- <archivo>` con la ruta relativa a tu directorio actual) y comprueba con `git status` que el árbol vuelve a estar limpio y la prueba a verde.

- [ ] **Step 4: Escribir el controller**

```typescript
// apps/api/src/modules/mejora-continua/mis-evidencias/infrastructure/http/mis-evidencias.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { EvidenciaDto } from '../../../evaluacion/infrastructure/http/dto/configuracion-evaluacion.dto.js';
import { GestionarMisEvidencias } from '../../application/use-cases/gestionar-mis-evidencias.use-case.js';

@ApiTags('Mis evidencias')
@ApiBearerAuth()
@Controller('mejora-continua/mis-evaluaciones')
export class MisEvidenciasController {
  constructor(private readonly casos: GestionarMisEvidencias) {}

  @Get()
  @ApiOperation({
    summary: 'Las evaluaciones asignadas al docente en el plan de evaluación vigente',
    description: 'Siempre de la carrera a cargo del usuario; no acepta un identificador de carrera.',
  })
  @ApiResponse({ status: 409, description: 'El usuario no tiene una carrera a cargo.' })
  listar(@ActorActual() actor: Actor) {
    return this.casos.listar(actor);
  }

  @Post(':id/evidencias')
  @ApiOperation({ summary: 'Registrar un enlace de evidencia en una evaluación propia' })
  @ApiResponse({ status: 403, description: 'La evaluación no existe o no es del usuario.' })
  @ApiResponse({ status: 409, description: 'El plan no está vigente o se alcanzó el tope.' })
  agregar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: EvidenciaDto,
  ) {
    return this.casos.agregar(actor, id, { enlace: dto.enlace, descripcion: dto.descripcion });
  }

  @Delete('evidencias/:evidenciaId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirar una evidencia que el propio docente registró' })
  @ApiResponse({ status: 403, description: 'La evidencia no existe o no es del usuario.' })
  async retirar(
    @Param('evidenciaId', ParseUUIDPipe) evidenciaId: string,
    @ActorActual() actor: Actor,
  ): Promise<void> {
    await this.casos.retirar(actor, evidenciaId);
  }
}
```

- [ ] **Step 5: Cablear en `app.module.ts`**

Lee el archivo y sigue el estilo de lo que ya hay para `ConsultarResumenDeCarrera`, `ResumenCarreraController` y `PLAN_VIGENTE_DE_CARRERA`. Los cambios:

1. **Imports** (junto a los del submódulo `resumen`):

```typescript
import {
  REPOSITORIO_MIS_EVIDENCIAS,
  type RepositorioMisEvidenciasPort,
} from './modules/mejora-continua/mis-evidencias/application/ports/mis-evidencias.port.js';
import { GestionarMisEvidencias } from './modules/mejora-continua/mis-evidencias/application/use-cases/gestionar-mis-evidencias.use-case.js';
import { MisEvidenciasController } from './modules/mejora-continua/mis-evidencias/infrastructure/http/mis-evidencias.controller.js';
import { MisEvidenciasRepositoryPrisma } from './modules/mejora-continua/mis-evidencias/infrastructure/persistence/mis-evidencias.repository.js';
```

`PublicadorDeEventos` y `PUBLICADOR_EVENTOS` ya están importados en este archivo para otras fábricas; si `PlanVigenteDeCarreraPort`/`ContenidoCurricularPort`/`AuthorizationPort` solo se importaban como valor o solo el símbolo, añade los `type` que falten a los imports existentes.

2. **`controllers:`** — añade `MisEvidenciasController` junto a `ResumenCarreraController`.

3. **`providers:`** — junto a `{ provide: LECTURA_RESUMEN_CARRERA, … }`:

```typescript
    { provide: REPOSITORIO_MIS_EVIDENCIAS, useClass: MisEvidenciasRepositoryPrisma },
```

y, junto a la fábrica de `ConsultarResumenDeCarrera`:

```typescript
    {
      provide: GestionarMisEvidencias,
      inject: [
        REPOSITORIO_MIS_EVIDENCIAS,
        PLAN_VIGENTE_DE_CARRERA,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        repositorio: RepositorioMisEvidenciasPort,
        planVigente: PlanVigenteDeCarreraPort,
        contenido: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarMisEvidencias(repositorio, planVigente, contenido, autorizacion, eventos),
    },
```

- [ ] **Step 6: Compilar, arrancar y comprobar**

Desde `apps/api`: `npm run build` → sin errores de TypeScript.
Run: `npm test` → todo en verde, incluida `mejora-continua/aislamiento.spec.ts`.
Arranca la app compilada contra `sgc_test` en un puerto libre, con las variables que necesita (valores desechables para `REDIS_URL` y `JWT_SECRET` si hacen falta): `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public' PORT=3917 npm start` (en segundo plano). Si el puerto 3000 está ocupado por la API de desarrollo del usuario, NO la detengas: usa otro `PORT`.
Expected en el log: «Nest application successfully started» y las tres rutas mapeadas: `Mapped {/api/v1/mejora-continua/mis-evaluaciones, GET}`, `Mapped {/api/v1/mejora-continua/mis-evaluaciones/:id/evidencias, POST}`, `Mapped {/api/v1/mejora-continua/mis-evaluaciones/evidencias/:evidenciaId, DELETE}`. Detén el proceso que arrancaste y comprueba que el puerto queda libre.

- [ ] **Step 7: Integración completa, typecheck, lint y commit**

Run: integración completa con la variable de `sgc_test` → todo en verde.
Run: `npx tsc --noEmit && npx eslint src/app.module.ts src/modules/mejora-continua/mis-evidencias test/integration` → sin errores.

```bash
git add apps/api/src/modules/mejora-continua/mis-evidencias/infrastructure/http/mis-evidencias.controller.ts \
        apps/api/src/app.module.ts \
        apps/api/test/integration/mis-evidencias-caso-de-uso.int.spec.ts
git commit -m "feat(mejora-continua): endpoints de mis evaluaciones y su cableado"
```

---

### Task 7: Cliente de la API y tipos del frontend

**Files:**
- Create: `apps/web/src/features/mejora-continua/api/mis-evidencias.api.ts`
- Test: `apps/web/src/features/mejora-continua/api/mis-evidencias.api.test.ts`

**Interfaces:**
- Consumes: `cliente` de `@/shared/api/cliente` (`get<T>(ruta)`, `post<T>(ruta, cuerpo)`, `delete(ruta)`).
- Produces (los usa Task 8): tipos `EvidenciaMia`, `EvaluacionAsignada`, `MisEvaluaciones`; funciones `listarMisEvaluaciones()`, `agregarEvidencia(asignaturaEvaluadaId, datos)`, `retirarEvidencia(evidenciaId)`.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
// apps/web/src/features/mejora-continua/api/mis-evidencias.api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cliente } from '@/shared/api/cliente';

import {
  agregarEvidencia,
  listarMisEvaluaciones,
  retirarEvidencia,
} from './mis-evidencias.api';

afterEach(() => vi.restoreAllMocks());

describe('cliente de mis evidencias', () => {
  it('listar pide GET /mejora-continua/mis-evaluaciones', async () => {
    const espia = vi.spyOn(cliente, 'get').mockResolvedValue({ evaluaciones: [] });
    await expect(listarMisEvaluaciones()).resolves.toEqual({ evaluaciones: [] });
    expect(espia).toHaveBeenCalledWith('/mejora-continua/mis-evaluaciones');
  });

  it('agregar hace POST con el enlace y la descripción a la evaluación indicada', async () => {
    const espia = vi.spyOn(cliente, 'post').mockResolvedValue({ id: 'nueva' });
    const r = await agregarEvidencia('ae-1', { enlace: 'https://a', descripcion: 'A' });
    expect(r).toEqual({ id: 'nueva' });
    expect(espia).toHaveBeenCalledWith('/mejora-continua/mis-evaluaciones/ae-1/evidencias', {
      enlace: 'https://a',
      descripcion: 'A',
    });
  });

  it('retirar hace DELETE de esa evidencia', async () => {
    const espia = vi.spyOn(cliente, 'delete').mockResolvedValue(undefined);
    await retirarEvidencia('ev-1');
    expect(espia).toHaveBeenCalledWith('/mejora-continua/mis-evaluaciones/evidencias/ev-1');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/web`): `npx vitest run src/features/mejora-continua/api/mis-evidencias.api.test.ts`
Expected: FAIL — no se puede resolver `./mis-evidencias.api`.

- [ ] **Step 3: Escribir el cliente**

```typescript
// apps/web/src/features/mejora-continua/api/mis-evidencias.api.ts
import { cliente } from '@/shared/api/cliente';

export interface EvidenciaMia {
  id: string;
  enlace: string;
  descripcion: string;
  /** Cierta si la registró el propio usuario: solo esas puede retirar. */
  propia: boolean;
}

export interface EvaluacionAsignada {
  /** Identificador de la asignatura evaluada. */
  id: string;
  asignatura: { id: string; codigo: string; nombre: string };
  competencia: { id: string; codigo: string; nombre: string };
  entregable: string;
  /** `fechaCierre` como `AAAA-MM-DD`, o nula si el periodo no tiene. */
  periodo: { id: string; etiqueta: string; fechaCierre: string | null };
  planEvaluacion: { id: string; codigo: string };
  evidencias: EvidenciaMia[];
  puedeAgregar: boolean;
}

export interface MisEvaluaciones {
  evaluaciones: EvaluacionAsignada[];
}

export function listarMisEvaluaciones(): Promise<MisEvaluaciones> {
  return cliente.get<MisEvaluaciones>('/mejora-continua/mis-evaluaciones');
}

export function agregarEvidencia(
  asignaturaEvaluadaId: string,
  datos: { enlace: string; descripcion: string },
): Promise<{ id: string }> {
  return cliente.post<{ id: string }>(
    `/mejora-continua/mis-evaluaciones/${asignaturaEvaluadaId}/evidencias`,
    datos,
  );
}

export function retirarEvidencia(evidenciaId: string): Promise<void> {
  return cliente.delete(`/mejora-continua/mis-evaluaciones/evidencias/${evidenciaId}`);
}
```

- [ ] **Step 4: Verificar, typecheck, lint y commit**

Run: `npx vitest run src/features/mejora-continua/api/mis-evidencias.api.test.ts` → PASS (3).
Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/features/mejora-continua/api` → sin errores. Formatea con prettier.

```bash
git add apps/web/src/features/mejora-continua/api/mis-evidencias.api.ts \
        apps/web/src/features/mejora-continua/api/mis-evidencias.api.test.ts
git commit -m "feat(mejora-continua): cliente de la API de mis evidencias"
```

---

### Task 8: Página `MisEvidenciasPage`, ruta y entrada del sidebar

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/TarjetaEvaluacion.tsx`
- Create: `apps/web/src/features/mejora-continua/pages/MisEvidenciasPage.tsx`
- Modify: `apps/web/src/app/App.tsx` (import y ruta `mis-evidencias`, junto a `mejora-continua/actas`)
- Modify: `apps/web/src/app/AppLayout.tsx` (sección «Mi trabajo» en `SECCIONES`)
- Test: `apps/web/src/features/mejora-continua/components/TarjetaEvaluacion.test.tsx`
- Test: `apps/web/src/features/mejora-continua/pages/MisEvidenciasPage.test.tsx`

**Interfaces:**
- Consumes: de Task 7 los tipos y funciones del cliente; `useSesion` (`identidad.carreraACargo`); `useEncabezado` (`@/app/encabezado`, `publicar({ migas, acciones })`); `ErrorDeNegocio` (`@/shared/api/cliente`, campo `estado`); `Boton`, `Campo`, `Entrada`, `EstadoVacio`, `Tarjeta` de `@/shared/components/ui`; `useQuery`/`useMutation`/`useQueryClient`.
- Produces: `TarjetaEvaluacion` (props abajo), `MisEvidenciasPage` (sin props), ruta `/mis-evidencias`, entrada de menú con `permiso: 'evidencia.registrar'`.

`TarjetaEvaluacion` props exactas:

```typescript
interface Props {
  readonly evaluacion: EvaluacionAsignada;
  readonly onAgregar: (asignaturaEvaluadaId: string, datos: { enlace: string; descripcion: string }) => Promise<void>;
  readonly onRetirar: (evidenciaId: string) => Promise<void>;
}
```
(las dos funciones rechazan con `Error` — un `ErrorDeNegocio` trae el mensaje del servidor — y la tarjeta lo muestra en su propio formulario.)

- [ ] **Step 1: Escribir las pruebas de `TarjetaEvaluacion` que fallan**

```tsx
// apps/web/src/features/mejora-continua/components/TarjetaEvaluacion.test.tsx
/** @vitest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EvaluacionAsignada } from '../api/mis-evidencias.api';
import { TarjetaEvaluacion } from './TarjetaEvaluacion';

const base: EvaluacionAsignada = {
  id: 'ae-1',
  asignatura: { id: 'a1', codigo: 'BD', nombre: 'Base de Datos' },
  competencia: { id: 'k1', codigo: 'CPE-01', nombre: 'Diseño de soluciones' },
  entregable: 'Proyecto final',
  periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: '2026-07-15' },
  planEvaluacion: { id: 'pev-1', codigo: 'EV-1' },
  evidencias: [
    { id: 'x1', enlace: 'https://ejemplo.pe/mia', descripcion: 'Acta mía', propia: true },
    { id: 'x2', enlace: 'https://ejemplo.pe/ajena', descripcion: 'Acta del coordinador', propia: false },
  ],
  puedeAgregar: true,
};

function montar(
  evaluacion: EvaluacionAsignada = base,
  manejadores: { onAgregar?: ReturnType<typeof vi.fn>; onRetirar?: ReturnType<typeof vi.fn> } = {},
) {
  const onAgregar = manejadores.onAgregar ?? vi.fn().mockResolvedValue(undefined);
  const onRetirar = manejadores.onRetirar ?? vi.fn().mockResolvedValue(undefined);
  render(<TarjetaEvaluacion evaluacion={evaluacion} onAgregar={onAgregar} onRetirar={onRetirar} />);
  return { onAgregar, onRetirar };
}

describe('TarjetaEvaluacion — lectura', () => {
  it('muestra la competencia, el entregable y el periodo con su fecha de cierre', () => {
    montar();
    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
    expect(screen.getByText(/Diseño de soluciones/)).toBeInTheDocument();
    expect(screen.getByText(/Proyecto final/)).toBeInTheDocument();
    expect(screen.getByText(/2026-I/)).toBeInTheDocument();
    expect(screen.getByText(/15 jul/)).toBeInTheDocument();
  });

  it('sin fecha de cierre no inventa una', () => {
    montar({ ...base, periodo: { ...base.periodo, fechaCierre: null } });
    expect(screen.getByText(/sin fecha de cierre/i)).toBeInTheDocument();
  });

  it('cada evidencia es un enlace que abre en pestaña nueva y sin dar acceso al origen', () => {
    montar();
    const enlace = screen.getByRole('link', { name: 'Acta mía' });
    expect(enlace).toHaveAttribute('href', 'https://ejemplo.pe/mia');
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sin evidencias lo dice', () => {
    montar({ ...base, evidencias: [] });
    expect(screen.getByText('Aún no registraste evidencias en esta evaluación.')).toBeInTheDocument();
  });
});

describe('TarjetaEvaluacion — retirar', () => {
  it('solo las evidencias propias tienen botón «Retirar»', () => {
    montar();
    expect(screen.getAllByRole('button', { name: /^Retirar/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retirar Acta mía' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirar Acta del coordinador' })).not.toBeInTheDocument();
  });

  it('retirar pide confirmación y no llama hasta confirmar', async () => {
    const { onRetirar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));

    expect(onRetirar).not.toHaveBeenCalled();
    expect(screen.getByText('¿Retirar esta evidencia?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onRetirar).toHaveBeenCalledWith('x1');
  });

  it('cancelar la confirmación no retira nada y vuelve al botón', async () => {
    const { onRetirar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onRetirar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retirar Acta mía' })).toBeInTheDocument();
  });

  it('si el servidor rechaza el retiro muestra su mensaje', async () => {
    montar(base, { onRetirar: vi.fn().mockRejectedValue(new Error('El plan de evaluación EV-1 no está vigente; ya no admite evidencias.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El plan de evaluación EV-1 no está vigente; ya no admite evidencias.',
    );
  });
});

describe('TarjetaEvaluacion — agregar', () => {
  it('con puedeAgregar muestra el formulario con sus dos campos etiquetados', () => {
    montar();
    expect(screen.getByLabelText('Enlace de la evidencia')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar evidencia' })).toBeInTheDocument();
  });

  it('envía el enlace y la descripción recortados, y limpia el formulario', async () => {
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('Enlace de la evidencia'), '  https://ejemplo.pe/nueva ');
    await userEvent.type(screen.getByLabelText('Descripción'), '  Informe técnico ');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(onAgregar).toHaveBeenCalledWith('ae-1', {
      enlace: 'https://ejemplo.pe/nueva',
      descripcion: 'Informe técnico',
    });
    expect(await screen.findByLabelText('Enlace de la evidencia')).toHaveValue('');
    expect(screen.getByLabelText('Descripción')).toHaveValue('');
  });

  it('con un campo vacío no envía y lo dice junto al campo', async () => {
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('Descripción'), 'Solo descripción');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(onAgregar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el enlace de la evidencia.')).toBeInTheDocument();
  });

  it('un enlace que no empieza por http:// o https:// no se envía', async () => {
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('Enlace de la evidencia'), 'javascript:alert(1)');
    await userEvent.type(screen.getByLabelText('Descripción'), 'Trampa');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(onAgregar).not.toHaveBeenCalled();
    expect(screen.getByText('El enlace debe empezar por http:// o https://.')).toBeInTheDocument();
  });

  it('si el servidor rechaza el alta muestra su mensaje y conserva lo escrito', async () => {
    montar(base, { onAgregar: vi.fn().mockRejectedValue(new Error('Esta evaluación ya tiene 20 evidencias.')) });
    await userEvent.type(screen.getByLabelText('Enlace de la evidencia'), 'https://ejemplo.pe/x');
    await userEvent.type(screen.getByLabelText('Descripción'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta evaluación ya tiene 20 evidencias.');
    expect(screen.getByLabelText('Enlace de la evidencia')).toHaveValue('https://ejemplo.pe/x');
  });

  it('sin puedeAgregar no hay formulario y se explica por qué', () => {
    montar({ ...base, puedeAgregar: false });
    expect(screen.queryByLabelText('Enlace de la evidencia')).not.toBeInTheDocument();
    expect(screen.getByText('Esta evaluación ya tiene 20 evidencias.')).toBeInTheDocument();
  });

  it('cada campo repetido dice a qué evaluación pertenece para lectores de pantalla', () => {
    montar();
    // Con varias tarjetas, «Enlace de la evidencia» a secas se repite: la región de la tarjeta lo distingue.
    expect(screen.getByRole('region', { name: /Base de Datos.*CPE-01.*2026-I/ })).toBeInTheDocument();
    const region = screen.getByRole('region', { name: /Base de Datos/ });
    expect(within(region).getByLabelText('Enlace de la evidencia')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/web`): `npx vitest run src/features/mejora-continua/components/TarjetaEvaluacion.test.tsx`
Expected: FAIL — no se puede resolver `./TarjetaEvaluacion`.

- [ ] **Step 3: Escribir `TarjetaEvaluacion`**

```tsx
// apps/web/src/features/mejora-continua/components/TarjetaEvaluacion.tsx
/**
 * Una evaluación asignada al docente, con sus evidencias y el formulario para
 * agregar más.
 *
 * Es una región con nombre (asignatura · competencia · periodo): con varias
 * tarjetas en la página, «Enlace de la evidencia» a secas se repite una vez por
 * tarjeta y no distingue nada; el nombre de la región sí (WCAG 2.4.6).
 */

import { useState, type FormEvent } from 'react';

import { Boton, Campo, Entrada, Tarjeta } from '@/shared/components/ui';

import type { EvaluacionAsignada } from '../api/mis-evidencias.api';

interface Props {
  readonly evaluacion: EvaluacionAsignada;
  readonly onAgregar: (
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string },
  ) => Promise<void>;
  readonly onRetirar: (evidenciaId: string) => Promise<void>;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-07-15` → `15 jul`. A mano: `toLocaleDateString` depende del ICU de cada entorno. */
function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? ''}`;
}

const mensajeDe = (fallo: unknown): string =>
  fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';

export function TarjetaEvaluacion({ evaluacion, onAgregar, onRetirar }: Props) {
  const [enlace, setEnlace] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errores, setErrores] = useState<{ enlace?: string; descripcion?: string }>({});
  const [errorDeEnvio, setErrorDeEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const [errorDeRetiro, setErrorDeRetiro] = useState<string | null>(null);

  const nombre = `${evaluacion.asignatura.nombre} · ${evaluacion.competencia.codigo} · ${evaluacion.periodo.etiqueta}`;

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const enlaceLimpio = enlace.trim();
    const descripcionLimpia = descripcion.trim();

    const nuevos: { enlace?: string; descripcion?: string } = {};
    if (!enlaceLimpio) nuevos.enlace = 'Escribe el enlace de la evidencia.';
    else if (!/^https?:\/\//i.test(enlaceLimpio)) {
      nuevos.enlace = 'El enlace debe empezar por http:// o https://.';
    }
    if (!descripcionLimpia) nuevos.descripcion = 'Escribe una descripción.';
    setErrores(nuevos);
    if (nuevos.enlace || nuevos.descripcion) return;

    setEnviando(true);
    setErrorDeEnvio(null);
    try {
      await onAgregar(evaluacion.id, { enlace: enlaceLimpio, descripcion: descripcionLimpia });
      setEnlace('');
      setDescripcion('');
    } catch (fallo) {
      setErrorDeEnvio(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function retirar(evidenciaId: string) {
    setErrorDeRetiro(null);
    try {
      await onRetirar(evidenciaId);
      setPorConfirmar(null);
    } catch (fallo) {
      setErrorDeRetiro(mensajeDe(fallo));
      setPorConfirmar(null);
    }
  }

  return (
    <Tarjeta role="region" aria-label={nombre} className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-tinta">
          {evaluacion.competencia.codigo} · {evaluacion.competencia.nombre}
        </p>
        <p className="mt-0.5 text-xs text-tinta-suave">
          {evaluacion.entregable} · Periodo {evaluacion.periodo.etiqueta} ·{' '}
          {evaluacion.periodo.fechaCierre
            ? `cierra el ${fechaCorta(evaluacion.periodo.fechaCierre)}`
            : 'sin fecha de cierre'}
        </p>
      </div>

      {evaluacion.evidencias.length === 0 ? (
        <p className="text-sm text-tinta-suave">Aún no registraste evidencias en esta evaluación.</p>
      ) : (
        <ul className="space-y-2">
          {evaluacion.evidencias.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <a
                href={ev.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-uc-primary underline-offset-2 hover:underline"
              >
                {ev.descripcion}
              </a>
              {ev.propia &&
                (porConfirmar === ev.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-tinta-suave">¿Retirar esta evidencia?</span>
                    <Boton tamano="sm" variante="peligro" onClick={() => void retirar(ev.id)}>
                      Confirmar
                    </Boton>
                    <Boton tamano="sm" variante="fantasma" onClick={() => setPorConfirmar(null)}>
                      Cancelar
                    </Boton>
                  </span>
                ) : (
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    aria-label={`Retirar ${ev.descripcion}`}
                    onClick={() => setPorConfirmar(ev.id)}
                  >
                    Retirar
                  </Boton>
                ))}
            </li>
          ))}
        </ul>
      )}

      {errorDeRetiro && (
        <p role="alert" className="text-xs font-medium text-alerta-fg">
          {errorDeRetiro}
        </p>
      )}

      {evaluacion.puedeAgregar ? (
        <form onSubmit={(e) => void agregar(e)} noValidate className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Enlace de la evidencia" error={errores.enlace}>
            {(props) => (
              <Entrada
                {...props}
                type="url"
                inputMode="url"
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder="https://"
              />
            )}
          </Campo>
          <Campo etiqueta="Descripción" error={errores.descripcion}>
            {(props) => (
              <Entrada
                {...props}
                maxLength={200}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            )}
          </Campo>
          <div className="sm:col-span-2">
            <Boton type="submit" variante="primario" disabled={enviando}>
              Agregar evidencia
            </Boton>
          </div>
          {errorDeEnvio && (
            <p role="alert" className="text-xs font-medium text-alerta-fg sm:col-span-2">
              {errorDeEnvio}
            </p>
          )}
        </form>
      ) : (
        <p className="text-sm text-tinta-suave">Esta evaluación ya tiene 20 evidencias.</p>
      )}
    </Tarjeta>
  );
}
```

- [ ] **Step 4: Verificar que pasa `TarjetaEvaluacion`**

Run: `npx vitest run src/features/mejora-continua/components/TarjetaEvaluacion.test.tsx`
Expected: PASS. Si `getByLabelText('Descripción')` encuentra más de un elemento, es señal de que la etiqueta «Descripción» se repite en la tarjeta: hay una sola en el formulario, revisa que no la hayas duplicado. Si `type="url"` hace que jsdom bloquee el envío del formulario por validación nativa, el formulario ya lleva `noValidate` (se valida a mano); no lo quites.

- [ ] **Step 5: Escribir las pruebas de la página que fallan**

```tsx
// apps/web/src/features/mejora-continua/pages/MisEvidenciasPage.test.tsx
/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/mis-evidencias.api';
import type { EvaluacionAsignada, MisEvaluaciones } from '../api/mis-evidencias.api';
import { MisEvidenciasPage } from './MisEvidenciasPage';

const evaluacion = (id: string, asignatura: string, evidencias = 0): EvaluacionAsignada => ({
  id,
  asignatura: { id: `a-${id}`, codigo: asignatura.slice(0, 2).toUpperCase(), nombre: asignatura },
  competencia: { id: 'k1', codigo: 'CPE-01', nombre: 'Diseño de soluciones' },
  entregable: 'Proyecto',
  periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: '2026-07-15' },
  planEvaluacion: { id: 'pev', codigo: 'EV-1' },
  evidencias: Array.from({ length: evidencias }, (_, i) => ({
    id: `x${id}${i}`,
    enlace: `https://ejemplo.pe/${id}${i}`,
    descripcion: `Evidencia ${id}${i}`,
    propia: true,
  })),
  puedeAgregar: true,
});

const dos: MisEvaluaciones = {
  evaluaciones: [evaluacion('e1', 'Base de Datos', 1), evaluacion('e2', 'Base de Datos'), evaluacion('e3', 'Redes')],
};

const sesion = (carreraACargo: string | null): ValorSesion => ({
  identidad: { id: 'u1', nombre: 'Jorge Huamán', permisos: ['evidencia.registrar'], roles: ['DOCENTE'], carreraACargo },
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: ['DOCENTE'],
  vistaActiva: 'DOCENTE',
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
});

function montar(carreraACargo: string | null = 'c1') {
  const publicar = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar }}>
          <ContextoSesion.Provider value={sesion(carreraACargo)}>
            <MisEvidenciasPage />
          </ContextoSesion.Provider>
        </CtxEncabezado.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { publicar };
}

afterEach(() => vi.restoreAllMocks());

describe('MisEvidenciasPage', () => {
  it('con evaluaciones muestra el título, las agrupa por asignatura y publica su migaja', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(dos);
    const { publicar } = montar();

    expect(await screen.findByRole('heading', { level: 1, name: 'Mis evidencias' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Base de Datos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Redes' })).toBeInTheDocument();
    // Dos evaluaciones de la misma asignatura comparten un solo encabezado.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Base de Datos' })).toHaveLength(1);
    // Una región por evaluación (su nombre lleva la competencia); las secciones por
    // asignatura son regiones con otro nombre y no cuentan aquí.
    expect(screen.getAllByRole('region', { name: /CPE-01/ })).toHaveLength(3);
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({ migas: [{ etiqueta: 'Mis evidencias' }] }),
    );
  });

  it('sin evaluaciones muestra el estado vacío', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({ evaluaciones: [] });
    montar();

    expect(
      await screen.findByText('No tienes evaluaciones asignadas en el plan vigente.'),
    ).toBeInTheDocument();
  });

  it('sin carrera a cargo no llama al endpoint y lo dice', () => {
    const espia = vi.spyOn(api, 'listarMisEvaluaciones');
    montar(null);

    expect(screen.getByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(espia).not.toHaveBeenCalled();
  });

  it('un 409 del servidor muestra el mismo mensaje y no ofrece reintentar', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockRejectedValue(
      new ErrorDeNegocio('Esta vista necesita una carrera asignada.', 409),
    );
    montar();

    expect(await screen.findByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByRole('status', { name: 'Cargando tus evaluaciones' })).toBeInTheDocument();
  });

  it('ante un fallo de red muestra el error con reintento, y reintentar vuelve a pedir', async () => {
    const espia = vi
      .spyOn(api, 'listarMisEvaluaciones')
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce(dos);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar tus evaluaciones.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mis evidencias' })).toBeInTheDocument();
  });

  it('agregar llama al cliente con la evaluación correcta y vuelve a pedir la lista', async () => {
    const listar = vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos')],
    });
    const agregar = vi.spyOn(api, 'agregarEvidencia').mockResolvedValue({ id: 'nueva' });
    montar();

    await userEvent.type(await screen.findByLabelText('Enlace de la evidencia'), 'https://ejemplo.pe/nueva');
    await userEvent.type(screen.getByLabelText('Descripción'), 'Informe');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    await waitFor(() =>
      expect(agregar).toHaveBeenCalledWith('e1', {
        enlace: 'https://ejemplo.pe/nueva',
        descripcion: 'Informe',
      }),
    );
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('retirar llama al cliente con la evidencia correcta y vuelve a pedir la lista', async () => {
    const listar = vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos', 1)],
    });
    const retirar = vi.spyOn(api, 'retirarEvidencia').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Retirar Evidencia e10' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(retirar).toHaveBeenCalledWith('xe10'));
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('si el alta falla por un estado que cambió, recarga la lista para no quedarse con datos viejos', async () => {
    const listar = vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos')],
    });
    vi.spyOn(api, 'agregarEvidencia').mockRejectedValue(
      new ErrorDeNegocio('El plan de evaluación EV-1 no está vigente; ya no admite evidencias.', 409),
    );
    montar();

    await userEvent.type(await screen.findByLabelText('Enlace de la evidencia'), 'https://ejemplo.pe/x');
    await userEvent.type(screen.getByLabelText('Descripción'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no está vigente');
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 6: Verificar que falla**

Run: `npx vitest run src/features/mejora-continua/pages/MisEvidenciasPage.test.tsx`
Expected: FAIL — no se puede resolver `./MisEvidenciasPage`.

- [ ] **Step 7: Escribir la página**

```tsx
// apps/web/src/features/mejora-continua/pages/MisEvidenciasPage.tsx
/**
 * «Mis evidencias»: las evaluaciones que el docente tiene asignadas en el plan de
 * evaluación vigente de su carrera, con sus enlaces de evidencia.
 *
 * Todo sale de `/mejora-continua/mis-evaluaciones`, que llega ordenado (por
 * asignatura, cierre de periodo y competencia): aquí solo se agrupa por asignatura
 * y se compone. Ante un fallo al agregar o retirar se vuelve a pedir la lista, para
 * no quedarse con datos que el servidor ya contradijo (por ejemplo un plan que dejó
 * de estar vigente).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, EstadoVacio } from '@/shared/components/ui';

import {
  agregarEvidencia,
  listarMisEvaluaciones,
  retirarEvidencia,
  type EvaluacionAsignada,
} from '../api/mis-evidencias.api';
import { TarjetaEvaluacion } from '../components/TarjetaEvaluacion';

function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div role="status" aria-label="Cargando tus evaluaciones" className="space-y-4">
      <div className={`${bloque} h-8 w-64`} />
      <div className={`${bloque} h-40`} />
      <div className={`${bloque} h-40`} />
    </div>
  );
}

function SinCarrera() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6">
      <p className="text-sm text-tinta">Esta vista necesita una carrera asignada.</p>
      <Link to="/usuarios" className="text-sm font-semibold text-uc-primary">
        Ir a Usuarios
      </Link>
    </div>
  );
}

/** Agrupa las evaluaciones ya ordenadas por asignatura, conservando el orden. */
function porAsignatura(
  evaluaciones: readonly EvaluacionAsignada[],
): { asignaturaId: string; nombre: string; evaluaciones: EvaluacionAsignada[] }[] {
  const grupos: { asignaturaId: string; nombre: string; evaluaciones: EvaluacionAsignada[] }[] = [];
  for (const e of evaluaciones) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.asignaturaId === e.asignatura.id) ultimo.evaluaciones.push(e);
    else grupos.push({ asignaturaId: e.asignatura.id, nombre: e.asignatura.nombre, evaluaciones: [e] });
  }
  return grupos;
}

export function MisEvidenciasPage() {
  const { publicar } = useEncabezado();
  const { identidad } = useSesion();
  const carreraACargo = identidad?.carreraACargo ?? null;
  const qc = useQueryClient();
  const clave = ['mis-evaluaciones', carreraACargo] as const;

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Mis evidencias' }], acciones: null });
    // `publicar` es estable dentro del render del layout; incluirlo dispararía un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consulta = useQuery({
    queryKey: clave,
    queryFn: listarMisEvaluaciones,
    enabled: carreraACargo !== null,
  });

  // Tras cada intento —salga bien o mal— se vuelve a pedir la lista: si salió mal
  // porque el estado cambió, la pantalla deja de mostrar lo que ya no es cierto.
  const alTerminar = () => qc.invalidateQueries({ queryKey: clave });

  const agregar = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: { enlace: string; descripcion: string } }) =>
      agregarEvidencia(id, datos),
    onSettled: alTerminar,
  });
  const retirar = useMutation({
    mutationFn: (evidenciaId: string) => retirarEvidencia(evidenciaId),
    onSettled: alTerminar,
  });

  if (carreraACargo === null) return <SinCarrera />;
  if (consulta.isPending) return <Esqueleto />;

  if (consulta.isError) {
    if (consulta.error instanceof ErrorDeNegocio && consulta.error.estado === 409) {
      return <SinCarrera />;
    }
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6"
      >
        <p className="text-sm text-tinta">No se pudieron cargar tus evaluaciones.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const grupos = porAsignatura(consulta.data.evaluaciones);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Mis evidencias</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Registra los enlaces de evidencia de las evaluaciones que tienes asignadas.
        </p>
      </div>

      {grupos.length === 0 ? (
        <EstadoVacio
          titulo="No tienes evaluaciones asignadas en el plan vigente."
          detalle="Cuando un coordinador te asigne una evaluación, aparecerá aquí."
        />
      ) : (
        grupos.map((g) => (
          <section key={g.asignaturaId} aria-labelledby={`asig-${g.asignaturaId}`} className="space-y-3">
            <h2 id={`asig-${g.asignaturaId}`} className="text-sm font-semibold text-tinta">
              {g.nombre}
            </h2>
            {g.evaluaciones.map((e) => (
              <TarjetaEvaluacion
                key={e.id}
                evaluacion={e}
                onAgregar={async (id, datos) => {
                  await agregar.mutateAsync({ id, datos });
                }}
                onRetirar={async (evidenciaId) => {
                  await retirar.mutateAsync(evidenciaId);
                }}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 8: Verificar que pasa la página**

Run: `npx vitest run src/features/mejora-continua/pages/MisEvidenciasPage.test.tsx`
Expected: PASS (9).

- [ ] **Step 9: Ruta y entrada de menú**

En `apps/web/src/app/App.tsx`: añade el import junto a los de `mejora-continua/pages/…`

```typescript
import { MisEvidenciasPage } from '@/features/mejora-continua/pages/MisEvidenciasPage';
```

y la ruta junto a `mejora-continua/actas`:

```tsx
                <Route path="mis-evidencias" element={<MisEvidenciasPage />} />
```

En `apps/web/src/app/AppLayout.tsx`, dentro de `SECCIONES`, añade una sección nueva justo después de la de «Mejora continua» (antes de «Sistema»):

```typescript
  {
    titulo: 'Mi trabajo',
    enlaces: [
      {
        a: '/mis-evidencias',
        etiqueta: 'Mis evidencias',
        icono: IconoPlan,
        exacto: false,
        permiso: 'evidencia.registrar',
      },
    ],
  },
```

- [ ] **Step 10: Prueba del menú**

En `apps/web/src/app/AppLayout.test.tsx` (ya existe, monta `AppLayout` con `puede: () => true`) añade dentro de un `describe` nuevo al final del archivo:

```tsx
describe('AppLayout — entrada «Mis evidencias»', () => {
  it('aparece cuando el usuario tiene evidencia.registrar y no cuando no lo tiene', () => {
    montar({ puede: (permiso: string) => permiso === 'evidencia.registrar' });
    expect(screen.getByRole('link', { name: 'Mis evidencias' })).toHaveAttribute(
      'href',
      '/mis-evidencias',
    );
  });

  it('no aparece sin el permiso', () => {
    montar({ puede: () => false });
    expect(screen.queryByRole('link', { name: 'Mis evidencias' })).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/app/AppLayout.test.tsx` → PASS. Si el `montar` de ese archivo no acepta `puede` como parte de la sesión parcial, comprueba su firma: acepta `Partial<ValorSesion>` (`montar(sesion: Partial<ValorSesion>)`), así que `puede` es válido.

- [ ] **Step 11: Suite completa, typecheck, lint y commit**

Run (desde `apps/web`): `npx vitest run` → todo en verde. `npx tsc --noEmit -p tsconfig.app.json && npx eslint src` → sin errores. Formatea con prettier lo creado/tocado.

```bash
git add apps/web/src/features/mejora-continua/components/TarjetaEvaluacion.tsx \
        apps/web/src/features/mejora-continua/components/TarjetaEvaluacion.test.tsx \
        apps/web/src/features/mejora-continua/pages/MisEvidenciasPage.tsx \
        apps/web/src/features/mejora-continua/pages/MisEvidenciasPage.test.tsx \
        apps/web/src/app/App.tsx apps/web/src/app/AppLayout.tsx apps/web/src/app/AppLayout.test.tsx
git commit -m "feat(mejora-continua): página Mis evidencias, ruta y entrada de menú"
```

---

### Task 9: e2e de accesibilidad de «Mis evidencias» y verificación final

**Files:**
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (bloque nuevo tras el de director)

**Interfaces:**
- Consumes: `test`/`expect` de `../fixtures/sesion` (opción `rol: 'docente'` — comprueba en `tests/e2e/fixtures/sesion.ts` y `tests/e2e/global-setup.ts` que `docente` existe entre los roles; el comentario de `global-setup.ts` indica que `e2e-docente@sgc.local` existe, pero puede no estar declarado como rol de sesión), `analizar` de `../fixtures/axe`.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: Comprobar el rol `docente` en el fixture de sesión**

Lee `tests/e2e/global-setup.ts` (la constante de cuentas, ~línea 22-30) y `tests/e2e/fixtures/sesion.ts` (el tipo `Rol`). Si `docente` no es uno de los roles de sesión, añádelo siguiendo el patrón de `director` (`docente: { email: 'e2e-docente@sgc.local' }`) en `global-setup.ts` y amplía el tipo `Rol` en `sesion.ts`. La cuenta ya se crea en CI (`.github/workflows/ci.yml`, «Crear las cuentas de prueba», línea con `--rol DOCENTE --carrera E2E`), no hace falta tocarla. Deja constancia en el informe de lo que hiciste.

- [ ] **Step 2: Añadir la prueba**

Tras el bloque `test.describe('con la cuenta de director', …)` de `accesibilidad.spec.ts`:

```typescript
test.describe('con la cuenta de docente', () => {
  // «Mis evidencias» depende del permiso `evidencia.registrar`, que solo tiene el
  // rol Docente. Sin evaluaciones asignadas en un plan de evaluación vigente
  // —el estado de esta cuenta en la base de pruebas— la página muestra su estado
  // vacío; el estado con datos lo cubren las pruebas de componente.
  test.use({ rol: 'docente' });

  test('la página Mis evidencias', async ({ page }) => {
    await page.goto('/mis-evidencias');
    // Con contenido real: esperar a que el esqueleto desaparezca y aparezca el
    // título descarta analizar la carga, que no distingue «sin problemas» de
    // «axe nunca vio la página».
    await expect(page.getByRole('heading', { level: 1, name: 'Mis evidencias' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Cargando tus evaluaciones' })).toBeHidden();

    await analizar(page, 'la página Mis evidencias del docente');
  });
});
```

- [ ] **Step 3: Preparar el entorno y ejecutar el e2e**

Levanta la API compilada y el frontend contra la base **`sgc_test`** en puertos libres (no uses ni detengas los servidores de desarrollo del usuario en 3000/5173): lee `tests/e2e/README.md` y `tests/e2e/playwright.config.ts` para saber cómo el e2e localiza la API y el frontend (variables de entorno o puertos). Prepara `sgc_test` con `DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'`: migraciones ya aplicadas, vuelve a sembrar (`npx tsx prisma/seed.ts`, para que el rol Docente reciba `evidencia.registrar`), `npm run e2e:preparar` y las cuentas de prueba con `scripts/crear-usuario.ts` como en el README/CI (contraseña desechable por `SGC_PASSWORD`, nunca la imprimas ni la subas).

Run (desde `tests/e2e`): `npx playwright test specs/accesibilidad.spec.ts -g "docente"`
Expected: PASS, sin violaciones de axe WCAG 2.1 AA. Si axe reporta contraste u otra violación, informa la regla, el elemento y los números; no cambies umbrales. Corregir en esta tarea solo si el arreglo es de tokens o marcado en `TarjetaEvaluacion`/`MisEvidenciasPage`.
Al terminar, DETÉN todo proceso que arrancaste y comprueba que los puertos temporales quedan libres.

- [ ] **Step 4: Verificación final de todo el trabajo**

Desde `apps/api`: `npm test`, `npx tsc --noEmit`, `npx eslint src test` y la integración completa con la variable de `sgc_test`.
Desde `apps/web`: `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json` y `npx eslint src`.
Expected: todo en verde. Los únicos errores de lint aceptables son los que ya existían antes de este trabajo.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/accesibilidad.spec.ts tests/e2e/global-setup.ts tests/e2e/fixtures/sesion.ts
git commit -m "test(e2e): accesibilidad de la página Mis evidencias"
```
(Si no tuviste que tocar `global-setup.ts` ni `sesion.ts`, añade solo `accesibilidad.spec.ts`; comprueba con `git status` antes de commitear.)
