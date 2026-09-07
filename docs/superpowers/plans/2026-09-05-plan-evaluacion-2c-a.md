# Plan de Evaluación · ciclo 2c-A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que se pueda crear un plan de evaluación a partir de un plan de medición Aprobado o Vigente, moverlo por su ciclo de vida, encontrarlo con filtros, y ver en su detalle las competencias y periodos que hereda, en solo lectura.

**Architecture:** El plan de evaluación **no copia nada** del plan de medición: lo referencia y lee competencias, periodos y matriz por `RepositorioPlanMedicionPort`, que ya existe. La base está congelada —solo se admiten planes Aprobado o Vigente, y esos no se editan— así que no hay desincronización posible. `mejora-continua` pasa a tener una subcarpeta por submódulo, con la máquina de estados y el agrupado por atributo compartidos en la raíz.

**Tech Stack:** NestJS 11 · Prisma 7 (multiSchema, esquema `mejora_continua`) · PostgreSQL 16 · React 18 + Vite + `@tanstack/react-query` · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-09-05-plan-evaluacion-2c-a-design.md`

## Global Constraints

- **Alcance:** RF-PE-000 a RF-PE-005, RF-PE-008 a RF-PE-012, RF-PE-043 a RF-PE-048. **RF-PE-006 y RF-PE-007 (edición) NO entran**: en 2c-A el plan no tiene ni un campo editable propio.
- **Código del plan:** `EV-<código del plan de estudios>-<D|I>-v<n>`, p. ej. `EV-PE-ISI-2026-v2-D-v1`. Nunca el prefijo `PE-`, que ya identifica un Plan de Estudios.
- **Permisos:** `evaluacion.leer`, `evaluacion.crear`, `evaluacion.editar`, `evaluacion.eliminar`, `evaluacion.aprobar`.
- **Invariante:** un único plan de evaluación `Vigente` por plan de medición (RF-PE-044 RN1), protegido con índice único parcial en SQL crudo.
- **Aislamiento (CLAUDE.md §3.2):** `mejora-continua` solo importa de `plan-estudios` el archivo `ports/contenido-curricular.port.js`, y de `auth` solo `ports/authorization.port.js` y `ports/directorio-usuarios.port.js`. Lo vigila `aislamiento.spec.ts`.
- **El dominio no importa NestJS ni Prisma.** La capa de aplicación tampoco importa Prisma.
- **Toda mutación relevante emite un evento de auditoría** y lo cubre una prueba.
- **Cada prueba nueva se comprueba por mutación** antes de darla por buena: se revierte el comportamiento y se confirma que la prueba falla. Una prueba que pasa con el código roto no prueba nada — en el ciclo anterior esa comprobación destapó dos pruebas vacuas.

**Cifras de partida (deben seguir en verde en cada tarea):** 716 unitarias en `apps/api`, 235 de integración, 182 en `apps/web`, 24 E2E.

**Comandos:**

```bash
# apps/api
npm test                    # unitarias
npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration

# apps/web
npm test && npm run typecheck && npm run lint && npm run format:check && npm run build

# tests/e2e  (la API y el worker compilados, no con tsx: esbuild no emite
# emitDecoratorMetadata y Nest construye vacías las clases con @Injectable)
cd apps/api && npm run build && THROTTLE_LIMIT=10000 node dist/main.js &
cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

---

### Task 1: Medición se muda a su carpeta, sin cambiar una línea de lógica

**Files:**
- Move: los 23 archivos de `apps/api/src/modules/mejora-continua/{domain,application,infrastructure}/**` a `apps/api/src/modules/mejora-continua/medicion/{domain,application,infrastructure}/**`
- Excepto, que suben a la raíz del módulo:
  - `domain/value-objects/estado-plan-medicion.ts` → `domain/value-objects/estado-plan.ts`
  - `domain/services/agrupar-por-atributo.ts` → se queda en `domain/services/agrupar-por-atributo.ts`
- Modify: `apps/api/src/app.module.ts` (rutas de import), `apps/api/src/modules/mejora-continua/aislamiento.spec.ts` (recorre desde la raíz del módulo, no hay que tocarlo salvo que falle)
- Modify: `apps/api/test/integration/*.int.spec.ts` (rutas de import)

**Interfaces:**
- Consumes: nada.
- Produces: la estructura de carpetas que usan todas las tareas siguientes. Las rutas nuevas son `modules/mejora-continua/medicion/...` para lo de medición y `modules/mejora-continua/domain/...` para lo compartido.

- [ ] **Step 1: Anotar las cifras de partida**

```bash
cd apps/api
npm test 2>&1 | grep -E "Test Files|Tests "
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration 2>&1 | grep -E "Test Files|Tests "
```

Expected: 716 unitarias, 235 de integración. Apúntalas: al final de la tarea tienen que ser **exactamente las mismas**. Si cambian, algo se movió mal.

- [ ] **Step 2: Mover con `git mv`, no copiando**

`git mv` conserva el historial del archivo; copiar y borrar lo pierde, y con él la respuesta a «por qué está esto así» dentro de un año.

```bash
cd apps/api/src/modules/mejora-continua
mkdir -p medicion/domain medicion/application medicion/infrastructure

# Lo compartido se queda arriba: se mueve PRIMERO, para que no lo arrastre el
# movimiento en bloque.
mkdir -p domain-comun/value-objects domain-comun/services
git mv domain/value-objects/estado-plan-medicion.ts domain-comun/value-objects/estado-plan.ts
git mv domain/services/agrupar-por-atributo.ts domain-comun/services/agrupar-por-atributo.ts

# El resto baja a medicion/
git mv domain medicion/domain
git mv application medicion/application
git mv infrastructure medicion/infrastructure

# Y lo compartido recupera su nombre definitivo
git mv domain-comun domain
```

- [ ] **Step 3: Corregir las rutas de import**

Guarda esto en el scratchpad como `rutas.py` y ejecútalo desde `apps/api`:

```python
import io, glob

CAMBIOS = [
    # Dentro de medicion/, lo compartido ahora está un nivel más arriba.
    ("'../../domain/value-objects/estado-plan-medicion.js'", "'../../../domain/value-objects/estado-plan.js'"),
    ("'../../domain/services/agrupar-por-atributo.js'", "'../../../domain/services/agrupar-por-atributo.js'"),
    ("'../value-objects/estado-plan-medicion.js'", "'../../../domain/value-objects/estado-plan.js'"),
    ("'../../../domain/value-objects/estado-plan-medicion.js'", "'../../../../domain/value-objects/estado-plan.js'"),
    # Todo lo que salía del módulo gana un nivel al bajar a medicion/
    ("'../../../../shared-kernel/", "'../../../../../shared-kernel/"),
    ("'../../../../platform/", "'../../../../../platform/"),
    ("'../../../auth/", "'../../../../auth/"),
    ("'../../../plan-estudios/", "'../../../../plan-estudios/"),
]

tocados = 0
for ruta in glob.glob('src/modules/mejora-continua/medicion/**/*.ts', recursive=True):
    t = original = io.open(ruta, encoding='utf-8').read()
    for viejo, nuevo in CAMBIOS:
        t = t.replace(viejo, nuevo)
    if t != original:
        io.open(ruta, 'w', encoding='utf-8', newline='\n').write(t)
        tocados += 1
print('archivos tocados:', tocados)
```

- [ ] **Step 4: Corregir `app.module.ts` y las pruebas de integración**

```bash
cd apps/api
sed -i "s|modules/mejora-continua/application/|modules/mejora-continua/medicion/application/|g; \
        s|modules/mejora-continua/infrastructure/|modules/mejora-continua/medicion/infrastructure/|g; \
        s|modules/mejora-continua/domain/events/|modules/mejora-continua/medicion/domain/events/|g" \
  src/app.module.ts
sed -i "s|mejora-continua/infrastructure/|mejora-continua/medicion/infrastructure/|g" \
  test/integration/*.int.spec.ts
```

- [ ] **Step 5: Compilar y arreglar lo que quede**

```bash
cd apps/api && npm run typecheck
```

Expected: puede quedar alguna ruta suelta. El error de `tsc` dice el archivo y la línea; corrígela a mano. **No inventes rutas nuevas: la regla es que bajar un archivo a `medicion/` añade un `../` a todo lo que salía del módulo, y que lo compartido vive en `modules/mejora-continua/domain/`.**

- [ ] **Step 6: Comprobar que es un traslado y nada más**

```bash
cd /d/App-ICACIT
git add -A
git diff --cached --stat | tail -3
git diff --cached -M --diff-filter=R --stat | wc -l
```

Expected: el grueso son renombrados (`R`). Los únicos cambios de contenido son líneas `import`. Si alguna otra línea cambió, revísala: esta tarea no toca lógica.

- [ ] **Step 7: Las mismas pruebas, en verde**

```bash
cd apps/api
npm test 2>&1 | grep -E "Test Files|Tests "
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration 2>&1 | grep -E "Test Files|Tests "
npm run typecheck && npm run lint && npm run format:check
```

Expected: **exactamente 716 y 235**, las de antes. Ni una más ni una menos.

- [ ] **Step 8: Commit**

```bash
cd /d/App-ICACIT
git commit -m "Medición se muda a su carpeta, sin cambiar nada

Vienen tres submódulos más —Evaluación, Planes de Mejora y Actas— y con los
cuatro planos, application/use-cases/ tendría una veintena de archivos de
cuatro asuntos distintos mezclados. La máquina de estados y el agrupado por
atributo suben a la raíz porque los comparten todos.

Renombrado puro: las mismas 716 unitarias y 235 de integración antes y después."
```

---

### Task 2: El permiso de una transición deja de traer su prefijo

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan.ts`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.ts`
- Modify: `apps/web/src/features/mejora-continua/domain/estado-medicion.ts`
- Modify: `apps/web/src/features/mejora-continua/pages/PlanMedicionPage.tsx`
- Test: `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan.spec.ts` (ya existe con otro nombre; se mueve en la Task 1), `apps/web/src/features/mejora-continua/domain/estado-medicion.test.ts`

**Interfaces:**
- Consumes: la estructura de la Task 1.
- Produces: `TransicionMedicion.permiso: 'editar' | 'aprobar'` — el **sufijo**, sin módulo. Quien lo consume antepone el suyo: `` `medicion.${t.permiso}` `` o `` `evaluacion.${t.permiso}` ``. La Task 6 lo usa.

**Por qué:** hoy la tabla de transiciones tiene `permiso: 'medicion.aprobar'` escrito a mano. Es la misma máquina de estados para los dos submódulos (RF-PE-004 lo dice literal), pero un plan de evaluación no se aprueba con `medicion.aprobar`. Sin este cambio, compartir la máquina daría permisos cruzados: quien puede aprobar mediciones podría aprobar evaluaciones sin tener `evaluacion.aprobar`.

- [ ] **Step 1: Escribir la prueba en rojo (API)**

En `estado-plan.spec.ts`, sustituye las aserciones que esperan `'medicion.aprobar'` por:

```ts
describe('el permiso es un sufijo, no un permiso entero', () => {
  it('no trae módulo: lo pone quien lo consume', () => {
    // La misma máquina la usan Planes de Medición y Planes de Evaluación. Si
    // aquí volviera a escribirse `medicion.aprobar`, aprobar un plan de
    // evaluación exigiría el permiso del submódulo equivocado — y quien tuviera
    // `medicion.aprobar` podría aprobar evaluaciones sin `evaluacion.aprobar`.
    for (const accion of ['enviar-a-revision', 'aprobar', 'observar', 'marcar-vigente', 'archivar'] as const) {
      expect(describirTransicion(accion).permiso).not.toContain('.');
    }
  });

  it('enviar a revisión lo puede quien edita; el resto, quien aprueba', () => {
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('observar').permiso).toBe('aprobar');
    expect(describirTransicion('marcar-vigente').permiso).toBe('aprobar');
    expect(describirTransicion('archivar').permiso).toBe('aprobar');
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/domain/value-objects/
```

Expected: FAIL — hoy devuelve `'medicion.aprobar'`.

- [ ] **Step 3: Cambiar el tipo y la tabla**

En `estado-plan.ts`:

```ts
export interface TransicionMedicion {
  readonly desde: EstadoMedicion;
  readonly hacia: EstadoMedicion;
  readonly etiqueta: string;
  /** RF-PM-038: la validación integral es requisito previo. */
  readonly exigeSinBloqueos: boolean;
  /** RF-PM-037 RN1: el rechazo u observación obliga a comentario. */
  readonly exigeComentario: boolean;
  /**
   * Sufijo del permiso, sin el submódulo: `editar` o `aprobar`.
   *
   * Lo antepone quien lo consume —`medicion.${permiso}`,
   * `evaluacion.${permiso}`— porque esta máquina de estados la comparten los
   * dos submódulos y el permiso no es el mismo. Escribirlo entero aquí dejaría
   * que quien puede aprobar mediciones aprobara también evaluaciones.
   */
  readonly permiso: 'editar' | 'aprobar';
}
```

Y en la tabla `TRANSICIONES`, `permiso: 'medicion.editar'` → `permiso: 'editar'`, y los cuatro `permiso: 'medicion.aprobar'` → `permiso: 'aprobar'`. Los comentarios que ya hay encima de cada uno se conservan.

- [ ] **Step 4: Que el consumidor ponga el prefijo**

En `gestionar-planes-medicion.use-case.ts`, dentro de `transicionar`:

```ts
    const transicion = describirTransicion(accion);
    await this.exigir(actor, `medicion.${transicion.permiso}`);
```

- [ ] **Step 5: Lo mismo en la copia del frontend**

`apps/web/src/features/mejora-continua/domain/estado-medicion.ts` es una copia deliberada de la máquina, con su propio juego de pruebas para que las dos no diverjan sin que nadie se entere. Aplica el mismo cambio de `permiso`, y en `PlanMedicionPage.tsx` línea ~194:

```tsx
              .filter((a) => puede(`medicion.${describirTransicion(a).permiso}`))
```

Y en `estado-medicion.test.ts`, las cuatro aserciones pasan a esperar `'aprobar'` y `'editar'`.

- [ ] **Step 6: Verde en los dos lados**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
```

Expected: 716 y 182, sin cambio de cifras salvo las dos pruebas nuevas de la API (718).

- [ ] **Step 7: Comprobación por mutación**

Vuelve a poner `permiso: 'medicion.aprobar'` en una sola de las cinco transiciones y ejecuta las pruebas de la API. Debe fallar la que dice `not.toContain('.')`. Restaura.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/web/src
git commit -m "El permiso de una transición es un sufijo, no un permiso entero

La máquina de estados la comparten Planes de Medición y Planes de Evaluación
—RF-PE-004 dice literal «replicando el mismo esquema»— pero el permiso no es
el mismo. Con el permiso escrito entero, quien pudiera aprobar mediciones
aprobaría también evaluaciones sin tener evaluacion.aprobar."
```

---

### Task 3: La tabla `planes_evaluacion`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_planes_evaluacion/migration.sql` (la genera Prisma; se edita para añadir el índice parcial)
- Test: `apps/api/test/integration/plan-evaluacion.int.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: el modelo `PlanEvaluacion` de Prisma, con `planMedicionId`, `codigo`, `version`, `estado`, `creadoEn`, `actualizadoEn`. La Task 5 lo consume.

- [ ] **Step 1: Añadir el modelo**

En `schema.prisma`, junto a los demás modelos de `mejora_continua`. Y en `model PlanMedicion`, añade la relación inversa `evaluaciones PlanEvaluacion[]` al lado de `documentos DocumentoMedicion[]`.

```prisma
/// RF-PE-002: el plan de evaluación de un plan de medición.
///
/// No guarda tipo, ni meta, ni competencias, ni periodos: se leen del plan de
/// medición base, que está congelado —RF-PE-001 RN3 solo admite bases Aprobado
/// o Vigente, y esos estados no se editan—. Copiarlos sería sostener dos veces
/// un dato inmutable, que es exactamente cómo el Excel del que sale este
/// sistema acabó declarando 249 créditos en un sitio y 210 en otro.
model PlanEvaluacion {
  id             String         @id @default(uuid()) @db.Uuid
  planMedicionId String         @map("plan_medicion_id") @db.Uuid
  codigo         String         @unique @db.VarChar(80)
  version        Int            @default(1)
  estado         EstadoMedicion @default(BORRADOR)

  creadoEn      DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  /// `Restrict` y no `Cascade`: un plan de medición Aprobado o Vigente no se
  /// puede borrar, así que esto no llega a ejercerse nunca. Se declara igual
  /// para que, si esa regla cambiara, el fallo sea un error de base de datos y
  /// no un plan de evaluación apuntando al vacío.
  plan PlanMedicion @relation(fields: [planMedicionId], references: [id], onDelete: Restrict)

  @@index([planMedicionId])
  @@map("planes_evaluacion")
  @@schema("mejora_continua")
}
```

- [ ] **Step 2: Generar la migración**

```bash
cd apps/api
npx prisma format && npx prisma validate
npx prisma migrate dev --name planes_evaluacion
npx prisma generate
```

`prisma generate` no es opcional: sin él, el cliente sigue sin conocer `documentoEvaluacion` y el error que da —`Unknown argument`— no dice que falte regenerar.

- [ ] **Step 3: Añadir el índice parcial a mano**

Prisma no expresa índices parciales. Abre el `migration.sql` recién creado y añade al final:

```sql
-- RF-PE-044 RN1: solo puede existir un plan de evaluación Vigente por plan de
-- medición. En la base y no solo en el dominio: dos peticiones simultáneas
-- pasarían las dos la comprobación de la aplicación y dejarían dos vigentes.
CREATE UNIQUE INDEX "evaluacion_una_vigente_por_medicion"
  ON "mejora_continua"."planes_evaluacion" ("plan_medicion_id")
  WHERE "estado" = 'VIGENTE';
```

Aplícalo:

```bash
npx prisma migrate reset --force --skip-seed && npx prisma migrate deploy && npm run db:seed
```

- [ ] **Step 4: Escribir la prueba de integración en rojo**

`apps/api/test/integration/plan-evaluacion.int.spec.ts`. Copia el `beforeEach` de `plan-medicion.int.spec.ts` —los TRUNCATE, la facultad, la carrera y el plan de estudios— y añade `mejora_continua.planes_evaluacion` **la primera** en la lista de tablas que se vacían.

```ts
/**
 * Pruebas de integración de la tabla de planes de evaluación (§6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede: que el índice único
 * parcial deje convivir dos Borradores pero no dos Vigentes del mismo plan de
 * medición, y que el `Restrict` impida borrar un plan de medición con una
 * evaluación colgando.
 */

describe('RF-PE-044 RN1 — un único Vigente por plan de medición', () => {
  it('el índice parcial rechaza el segundo Vigente', async () => {
    const base = await crearPlanMedicion();
    const a = await crearEvaluacion(base.id, 'EV-1');
    const b = await crearEvaluacion(base.id, 'EV-2');

    await prisma.planEvaluacion.update({ where: { id: a.id }, data: { estado: 'VIGENTE' } });

    await expect(
      prisma.planEvaluacion.update({ where: { id: b.id }, data: { estado: 'VIGENTE' } }),
    ).rejects.toThrow();
  });

  it('pero deja convivir dos Borradores', async () => {
    // Es la mitad que se olvida: un índice único sin el WHERE prohibiría también
    // esto, y entonces no se podría preparar la evaluación siguiente mientras la
    // actual está en vigor.
    const base = await crearPlanMedicion();
    await crearEvaluacion(base.id, 'EV-1');
    await crearEvaluacion(base.id, 'EV-2');

    expect(await prisma.planEvaluacion.count({ where: { planMedicionId: base.id } })).toBe(2);
  });

  it('dos planes de medición distintos pueden tener cada uno su Vigente', async () => {
    const uno = await crearPlanMedicion('PM-1');
    const otro = await crearPlanMedicion('PM-2');
    const a = await crearEvaluacion(uno.id, 'EV-1');
    const b = await crearEvaluacion(otro.id, 'EV-2');

    await prisma.planEvaluacion.update({ where: { id: a.id }, data: { estado: 'VIGENTE' } });
    await prisma.planEvaluacion.update({ where: { id: b.id }, data: { estado: 'VIGENTE' } });

    expect(await prisma.planEvaluacion.count({ where: { estado: 'VIGENTE' } })).toBe(2);
  });
});

describe('la referencia al plan de medición', () => {
  it('no se puede borrar un plan de medición con una evaluación colgando', async () => {
    // `Restrict`: en la práctica no se ejerce —un plan Aprobado o Vigente no se
    // borra— pero si esa regla cambiara, esto falla en la base en vez de dejar
    // un plan de evaluación sin base.
    const base = await crearPlanMedicion();
    await crearEvaluacion(base.id, 'EV-1');

    await expect(prisma.planMedicion.delete({ where: { id: base.id } })).rejects.toThrow();
  });
});
```

Con estos dos ayudantes en el ámbito del archivo:

```ts
async function crearPlanMedicion(codigo = 'PM-1') {
  return prisma.planMedicion.create({
    data: { planEstudiosId, tipo: 'DIRECTA', codigo, meta: 0.7, estado: 'APROBADO' },
  });
}

async function crearEvaluacion(planMedicionId: string, codigo: string) {
  return prisma.planEvaluacion.create({ data: { planMedicionId, codigo } });
}
```

- [ ] **Step 5: Ejecutar hasta verde**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npx prisma migrate deploy
npm run test:integration -- test/integration/plan-evaluacion.int.spec.ts
```

Expected: PASS, 4 pruebas.

- [ ] **Step 6: Comprobar que el índice es de verdad**

```bash
grep -c "evaluacion_una_vigente_por_medicion" prisma/migrations/*_planes_evaluacion/migration.sql
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `1`, y «No difference detected».

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/test
git commit -m "El plan de evaluación tiene su tabla, con su invariante en la base

No guarda tipo, meta, competencias ni periodos: los lee del plan de medición
base, que está congelado. El índice parcial protege RF-PE-044 RN1 —un único
Vigente por plan de medición— donde dos peticiones simultáneas no pueden
saltárselo."
```

---

### Task 4: El código `EV-`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/domain/value-objects/codigo-evaluacion.ts`
- Test: `apps/api/src/modules/mejora-continua/evaluacion/domain/value-objects/codigo-evaluacion.spec.ts`

**Interfaces:**
- Consumes: `TipoMedicion` de `medicion/domain/value-objects/tipo-medicion.js`.
- Produces: `siguienteCodigoEvaluacion(codigoPlanEstudios: string, tipo: TipoMedicion, yaUsados: readonly string[]): string`. La Task 6 lo consume.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
/**
 * El código de un plan de evaluación (RF-PE-003).
 *
 * Función aparte y no un parámetro de la de medición: fundirlas obligaría a
 * pasar el prefijo desde fuera, y un prefijo como parámetro es cómo se acaba
 * generando un `PM-` donde tocaba un `EV-`.
 */

import { describe, expect, it } from 'vitest';

import { siguienteCodigoEvaluacion } from './codigo-evaluacion.js';

describe('RF-PE-003 — el código', () => {
  it('empieza por EV, nunca por PE', () => {
    // `PE-` ya identifica un Plan de Estudios en este sistema
    // (`PE-ISI-2026-v2`). Dos cosas distintas con el mismo prefijo en la misma
    // pantalla se confunden.
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', []);

    expect(c.startsWith('EV-')).toBe(true);
    expect(c).toBe('EV-PE-ISI-2026-v2-D-v1');
  });

  it('la letra distingue directa de indirecta', () => {
    expect(siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'INDIRECTA', [])).toBe(
      'EV-PE-ISI-2026-v2-I-v1',
    );
  });

  it('el correlativo sigue al mayor usado, no a la cantidad', () => {
    // Si un plan se eliminó, reutilizar su número haría que dos planes
    // distintos compartieran código en la bitácora.
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', [
      'EV-PE-ISI-2026-v2-D-v1',
      'EV-PE-ISI-2026-v2-D-v3',
    ]);

    expect(c).toBe('EV-PE-ISI-2026-v2-D-v4');
  });

  it('los códigos de otro tipo no cuentan para el correlativo', () => {
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', [
      'EV-PE-ISI-2026-v2-I-v7',
    ]);

    expect(c).toBe('EV-PE-ISI-2026-v2-D-v1');
  });

  it('los códigos de otro plan de estudios tampoco', () => {
    const c = siguienteCodigoEvaluacion('PE-ISI-2026-v2', 'DIRECTA', [
      'EV-PE-CIV-2026-v1-D-v9',
    ]);

    expect(c).toBe('EV-PE-ISI-2026-v2-D-v1');
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/evaluacion/domain/
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir la función**

```ts
/**
 * El código de un plan de evaluación (RF-PE-003).
 *
 * Misma forma que el de medición cambiando el prefijo, y **no** una
 * generalización de aquella con el prefijo como parámetro: un prefijo que llega
 * de fuera es cómo se acaba generando un `PM-` donde tocaba un `EV-`.
 *
 * El prefijo no es `PE-` a propósito: en este sistema `PE-` ya identifica un
 * Plan de Estudios (`PE-ISI-2026-v2`), y el código del plan de evaluación lo
 * lleva dentro.
 */

import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';

export function siguienteCodigoEvaluacion(
  codigoPlanEstudios: string,
  tipo: TipoMedicion,
  yaUsados: readonly string[],
): string {
  const letra = tipo === 'DIRECTA' ? 'D' : 'I';
  const prefijo = `EV-${codigoPlanEstudios}-${letra}-v`;

  // El mayor usado y no la cantidad: si alguno se eliminó, reutilizar su número
  // haría que dos planes distintos compartieran código en la bitácora.
  const correlativos = yaUsados
    .filter((c) => c.startsWith(prefijo))
    .map((c) => Number.parseInt(c.slice(prefijo.length), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = correlativos.length === 0 ? 1 : Math.max(...correlativos) + 1;
  return `${prefijo}${siguiente}`;
}
```

- [ ] **Step 4: Ejecutar hasta verde y comprobar por mutación**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/domain/
```

Expected: PASS, 5 pruebas.

Mutación: cambia `EV-` por `PM-` y ejecuta. Deben fallar al menos dos. Restaura.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/evaluacion
git commit -m "El código del plan de evaluación

Prefijo EV- y no PE-, que en este sistema ya identifica un Plan de Estudios y
va dentro del propio código."
```

---

### Task 5: El puerto y el repositorio

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/ports/plan-evaluacion.port.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.ts`
- Test: `apps/api/test/integration/plan-evaluacion.int.spec.ts` (se amplía)

**Interfaces:**
- Consumes: el modelo de la Task 3.
- Produces:

```ts
export interface DatosPlanEvaluacion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoMedicion;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface FiltroPlanesEvaluacion {
  readonly planMedicionId?: string;
  /** Filtra atravesando la relación: el tipo vive en el plan de medición. */
  readonly tipo?: TipoMedicion;
  readonly estado?: EstadoMedicion;
  readonly texto?: string;
}

export interface RepositorioPlanEvaluacionPort {
  listar(filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]>;
  porId(id: string): Promise<DatosPlanEvaluacion | null>;
  /** RF-PE-044: cero o uno; el índice parcial garantiza que no haya dos. */
  vigenteDe(planMedicionId: string): Promise<DatosPlanEvaluacion | null>;
  /** Códigos ya usados de ese plan de estudios y ese tipo, para el correlativo. */
  codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]>;
  crear(datos: { planMedicionId: string; codigo: string }): Promise<DatosPlanEvaluacion>;
  cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanEvaluacion>;
  eliminar(id: string): Promise<void>;
}

export const REPOSITORIO_PLAN_EVALUACION = Symbol('RepositorioPlanEvaluacionPort');
```

La Task 6 los consume.

- [ ] **Step 1: Escribir el puerto**

El bloque **Interfaces** de arriba, tal cual, en `plan-evaluacion.port.ts`. Con esta cabecera:

```ts
/**
 * Lo que la aplicación necesita de la persistencia de planes de evaluación.
 *
 * Deliberadamente más corto que el de medición: no hay `actualizar` porque en
 * 2c-A un plan de evaluación no tiene ni un campo editable propio —RF-PE-002 no
 * captura ninguno, y el tipo y la meta vienen del plan base—. Llega en 2c-B con
 * la configuración por competencia.
 */
```

- [ ] **Step 2: Escribir las pruebas de integración en rojo**

Amplía `plan-evaluacion.int.spec.ts` con un `describe` nuevo, instanciando el repositorio como hace `plan-medicion.int.spec.ts`:

```ts
const repo = new PlanEvaluacionRepositoryPrisma(prisma);

describe('el repositorio', () => {
  it('crea en Borrador y lo devuelve con su código', async () => {
    const base = await crearPlanMedicion();

    const e = await repo.crear({ planMedicionId: base.id, codigo: 'EV-X-D-v1' });

    expect(e.estado).toBe('Borrador');
    expect(e.codigo).toBe('EV-X-D-v1');
    expect(e.version).toBe(1);
  });

  it('el estado viaja al vocabulario del dominio, no en MAYÚSCULAS', async () => {
    const base = await crearPlanMedicion();
    const e = await repo.crear({ planMedicionId: base.id, codigo: 'EV-X-D-v1' });

    const tras = await repo.cambiarEstado(e.id, 'En revisión');

    expect(tras.estado).toBe('En revisión');
    expect((await repo.porId(e.id))?.estado).toBe('En revisión');
  });

  it('vigenteDe devuelve el único vigente, o null', async () => {
    const base = await crearPlanMedicion();
    const e = await repo.crear({ planMedicionId: base.id, codigo: 'EV-X-D-v1' });

    expect(await repo.vigenteDe(base.id)).toBeNull();

    await repo.cambiarEstado(e.id, 'Vigente');

    expect((await repo.vigenteDe(base.id))?.id).toBe(e.id);
  });

  it('filtrar por tipo atraviesa la relación, sin desnormalizar', async () => {
    // El tipo vive en el plan de medición. Copiarlo aquí sería una segunda
    // fuente de verdad de un dato que además no puede cambiar.
    const directa = await crearPlanMedicion('PM-D', 'DIRECTA');
    const indirecta = await crearPlanMedicion('PM-I', 'INDIRECTA');
    await repo.crear({ planMedicionId: directa.id, codigo: 'EV-D-v1' });
    await repo.crear({ planMedicionId: indirecta.id, codigo: 'EV-I-v1' });

    const soloDirectas = await repo.listar({ tipo: 'DIRECTA' });

    expect(soloDirectas.map((e) => e.codigo)).toEqual(['EV-D-v1']);
  });

  it('codigosDe solo trae los de ese plan de estudios y ese tipo', async () => {
    const directa = await crearPlanMedicion('PM-D', 'DIRECTA');
    const indirecta = await crearPlanMedicion('PM-I', 'INDIRECTA');
    await repo.crear({ planMedicionId: directa.id, codigo: 'EV-D-v1' });
    await repo.crear({ planMedicionId: indirecta.id, codigo: 'EV-I-v1' });

    expect(await repo.codigosDe(planEstudiosId, 'DIRECTA')).toEqual(['EV-D-v1']);
  });

  it('el segundo Vigente sale como error de negocio, no como un 500', async () => {
    // El índice parcial lo rechaza con un P2002 que nombra el índice. Dejarlo
    // salir tal cual daría un 500 con el nombre de una estructura interna.
    const base = await crearPlanMedicion();
    const a = await repo.crear({ planMedicionId: base.id, codigo: 'EV-1' });
    const b = await repo.crear({ planMedicionId: base.id, codigo: 'EV-2' });
    await repo.cambiarEstado(a.id, 'Vigente');

    await expect(repo.cambiarEstado(b.id, 'Vigente')).rejects.toThrow(/ya tiene un plan de evaluación vigente/);
  });

  it('el listado va del más reciente al más antiguo', async () => {
    const base = await crearPlanMedicion();
    await repo.crear({ planMedicionId: base.id, codigo: 'EV-1' });
    await repo.crear({ planMedicionId: base.id, codigo: 'EV-2' });

    expect((await repo.listar()).map((e) => e.codigo)).toEqual(['EV-2', 'EV-1']);
  });
});
```

Amplía el ayudante para aceptar el tipo:

```ts
async function crearPlanMedicion(codigo = 'PM-1', tipo: 'DIRECTA' | 'INDIRECTA' = 'DIRECTA') {
  return prisma.planMedicion.create({
    data: { planEstudiosId, tipo, codigo, meta: 0.7, estado: 'APROBADO' },
  });
}
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/plan-evaluacion.int.spec.ts
```

Expected: FAIL — no existe el repositorio.

- [ ] **Step 4: Escribir el repositorio**

Sigue el patrón de `medicion/infrastructure/persistence/plan-medicion.repository.ts`: los traductores `A_BD` y `A_DOMINIO` entre el enum de la base y el vocabulario del dominio, y una `SELECCION` explícita.

```ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import { ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';
import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';
import type {
  DatosPlanEvaluacion,
  FiltroPlanesEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../../application/ports/plan-evaluacion.port.js';

type EstadoBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

/** El enum de la base va en mayúsculas; el del dominio, en lenguaje llano. */
const A_BD: Readonly<Record<EstadoMedicion, EstadoBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};

const A_DOMINIO = Object.fromEntries(
  Object.entries(A_BD).map(([k, v]) => [v, k]),
) as Record<EstadoBd, EstadoMedicion>;

const SELECCION = {
  id: true,
  planMedicionId: true,
  codigo: true,
  version: true,
  estado: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

interface Fila {
  id: string;
  planMedicionId: string;
  codigo: string;
  version: number;
  estado: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

function aDatos(fila: Fila): DatosPlanEvaluacion {
  return {
    id: fila.id,
    planMedicionId: fila.planMedicionId,
    codigo: fila.codigo,
    version: fila.version,
    estado: A_DOMINIO[fila.estado as EstadoBd] ?? 'Borrador',
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

/**
 * Reconoce la violación de un índice único concreto.
 *
 * Se mira el nombre del índice y no solo el código de error: si mañana hay dos
 * índices únicos en la tabla, un `P2002` genérico daría el mensaje equivocado.
 */
function esViolacionDeUnico(error: unknown, indice: string): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  return e?.code === 'P2002' && JSON.stringify(e.meta?.target ?? '').includes(indice);
}

@Injectable()
export class PlanEvaluacionRepositoryPrisma implements RepositorioPlanEvaluacionPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroPlanesEvaluacion = {}): Promise<DatosPlanEvaluacion[]> {
    const filas = await this.prisma.planEvaluacion.findMany({
      where: {
        ...(filtro.planMedicionId ? { planMedicionId: filtro.planMedicionId } : {}),
        ...(filtro.estado ? { estado: A_BD[filtro.estado] } : {}),
        ...(filtro.texto ? { codigo: { contains: filtro.texto, mode: 'insensitive' as const } } : {}),
        // El tipo vive en el plan de medición: se filtra atravesando la
        // relación en vez de copiarlo aquí.
        ...(filtro.tipo ? { plan: { tipo: filtro.tipo } } : {}),
      },
      orderBy: { creadoEn: 'desc' },
      select: SELECCION,
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosPlanEvaluacion | null> {
    const fila = await this.prisma.planEvaluacion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  async vigenteDe(planMedicionId: string): Promise<DatosPlanEvaluacion | null> {
    const fila = await this.prisma.planEvaluacion.findFirst({
      where: { planMedicionId, estado: 'VIGENTE' },
      select: SELECCION,
    });
    return fila ? aDatos(fila) : null;
  }

  async codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]> {
    const filas = await this.prisma.planEvaluacion.findMany({
      where: { plan: { planEstudiosId, tipo } },
      select: { codigo: true },
    });
    return filas.map((f) => f.codigo);
  }

  async crear(datos: { planMedicionId: string; codigo: string }): Promise<DatosPlanEvaluacion> {
    const fila = await this.prisma.planEvaluacion.create({ data: datos, select: SELECCION });
    return aDatos(fila);
  }

  async cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanEvaluacion> {
    try {
      const fila = await this.prisma.planEvaluacion.update({
        where: { id },
        data: { estado: A_BD[estado] },
        select: SELECCION,
      });
      return aDatos(fila);
    } catch (error) {
      // El índice parcial rechaza el segundo Vigente con un P2002 cuyo mensaje
      // nombra el índice. Dejarlo salir tal cual daría un 500 con el nombre de
      // una estructura interna; traducirlo aquí es lo único que puede convertir
      // esa violación en algo que quien lo lea entienda.
      if (esViolacionDeUnico(error, 'evaluacion_una_vigente_por_medicion')) {
        throw new ReglaDeNegocioViolada(
          'Ese plan de medición ya tiene un plan de evaluación vigente. Archiva el actual antes de dar vigencia a otro.',
        );
      }
      throw error;
    }
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.planEvaluacion.delete({ where: { id } });
  }
}
```

- [ ] **Step 5: Ejecutar hasta verde y comprobar por mutación**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/plan-evaluacion.int.spec.ts
npm run typecheck && npm run lint && npm run format:check
```

Expected: PASS, 11 pruebas en ese archivo.

Mutación: quita `plan: { tipo: filtro.tipo }` del `where` de `listar`. Debe fallar «filtrar por tipo atraviesa la relación». Restaura.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "El repositorio de planes de evaluación

Sin actualizar: en 2c-A un plan de evaluación no tiene ni un campo editable
propio. El tipo se filtra atravesando la relación con el plan de medición, que
es donde vive, en vez de copiarlo."
```

---

### Task 6: El caso de uso, sus eventos y sus permisos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/domain/events/eventos-evaluacion.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: `RepositorioPlanEvaluacionPort` (Task 5), `siguienteCodigoEvaluacion` (Task 4), `TransicionMedicion.permiso` como sufijo (Task 2), y de lo ya existente: `RepositorioPlanMedicionPort`, `ContenidoCurricularPort`, `AuthorizationPort`, `agruparPorAtributo`.
- Produces:

```ts
export interface VistaPlanEvaluacion {
  readonly plan: DatosPlanEvaluacion;
  /** Del plan de medición base, no copiado: tipo, meta, código. */
  readonly base: { id: string; codigo: string; tipo: TipoMedicion; metaPorcentaje: number };
  readonly grupos: GrupoDeCompetencias[];
  readonly periodos: readonly { id: string; etiqueta: string; orden: number }[];
  /** RF-PE-012: las combinaciones programadas, como «competenciaId|periodoId». */
  readonly programadas: readonly string[];
}

export class GestionarPlanesEvaluacion {
  basesElegibles(actor: Actor): Promise<DatosPlanMedicion[]>;
  listar(actor: Actor, filtro?: FiltroPlanesEvaluacion): Promise<DatosPlanEvaluacion[]>;
  porId(actor: Actor, id: string): Promise<VistaPlanEvaluacion>;
  vigenteDe(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion | null>;
  crear(actor: Actor, planMedicionId: string): Promise<DatosPlanEvaluacion>;
  eliminar(actor: Actor, id: string): Promise<void>;
  transicionar(actor: Actor, id: string, accion: AccionMedicion, contexto: { comentario?: string }): Promise<DatosPlanEvaluacion>;
}
```

La Task 7 los consume.

- [ ] **Step 1: Escribir los eventos**

`eventos-evaluacion.ts`, con la misma forma que `eventos-medicion.ts`:

```ts
/**
 * Eventos de auditoría de los planes de evaluación (RF-PE-048).
 *
 * Entidad `PlanEvaluacion`: la bitácora se consulta filtrando por la cosa que
 * le importa a quien pregunta, y esa es el plan.
 */

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { DomainEvent } from '../../../../../shared-kernel/domain-events/domain-event.js';

abstract class EventoEvaluacion extends DomainEvent {
  readonly entidad = 'PlanEvaluacion';
}

export class PlanEvaluacionCreado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.creado';
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string, codigoBase: string) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo} creado sobre el plan de medición ${codigoBase}.`;
  }
}

export class PlanEvaluacionEliminado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.eliminado';
  readonly detalle: string;

  constructor(actor: Actor, readonly entidadId: string, codigo: string) {
    super(actor);
    this.detalle = `Plan de evaluación ${codigo} eliminado.`;
  }
}

export class PlanEvaluacionTransicionado extends EventoEvaluacion {
  readonly nombre = 'evaluacion.transicionado';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    desde: string,
    hacia: string,
    comentario?: string,
  ) {
    super(actor);
    this.detalle =
      `Plan de evaluación ${codigo}: ${desde} → ${hacia}` +
      (comentario ? `. Comentario: ${comentario}` : '.');
  }
}
```

- [ ] **Step 2: Sembrar los permisos**

En `prisma/seed.ts`, junto a los cinco de `medicion.*` (líneas ~73-77):

```ts
  ['evaluacion.leer', 'Consultar planes de evaluación', 'mejora-continua'],
  ['evaluacion.crear', 'Crear un plan de evaluación', 'mejora-continua'],
  ['evaluacion.editar', 'Editar un plan de evaluación en Borrador', 'mejora-continua'],
  ['evaluacion.eliminar', 'Eliminar un plan de evaluación en Borrador', 'mejora-continua'],
  ['evaluacion.aprobar', 'Aprobar, observar y dar vigencia a un plan de evaluación', 'mejora-continua'],
```

Y a cada rol, en paralelo exacto a lo que ya tiene de medición:

| Rol | Añadir |
|---|---|
| `ADMIN_SISTEMA` | `evaluacion.leer` |
| `DIRECTOR_CARRERA` | los cinco |
| `COORDINADOR_ACADEMICO` | `leer`, `crear`, `editar`, `eliminar` — **no** `aprobar` |
| `DOCENTE` | `evaluacion.leer` |
| `USUARIO_CONSULTOR` | `evaluacion.leer` |

Que el Coordinador no apruebe no es un olvido: es la misma separación que ya lo deja fuera de `medicion.aprobar`. Quien construye no da el visto bueno. Coincide con RF-PE-046.

```bash
cd apps/api && npm run db:seed
```

- [ ] **Step 3: Escribir las pruebas del caso de uso en rojo**

`gestionar-planes-evaluacion.spec.ts`. Sigue el patrón de `gestionar-planes-medicion.spec.ts`: dobles de los puertos, `permitirTodo()` y `denegar()` para la autorización, y un `montar()` que devuelve `{ caso, publicados }`.

```ts
describe('RF-PE-001 y RF-PE-002 — el alta', () => {
  it('nace en Borrador con su código EV-', async () => {
    const { caso } = montar();

    const creado = await caso.crear(ACTOR, 'pm-1');

    expect(creado.estado).toBe('Borrador');
    expect(creado.codigo).toBe('EV-PE-ISI-2026-v2-D-v1');
  });

  it('RN3: una base que no está Aprobado ni Vigente se rechaza', async () => {
    // Crear la evaluación de un plan que aún se edita dejaría un plan de
    // evaluación cuyas competencias y periodos pueden cambiar bajo los pies.
    const { caso } = montar({ base: planMedicion({ estado: 'Borrador' }) });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RN2: el tipo no se elige, lo determina la base', async () => {
    const { caso } = montar({ base: planMedicion({ tipo: 'INDIRECTA' }) });

    const creado = await caso.crear(ACTOR, 'pm-1');

    expect(creado.codigo).toContain('-I-v');
  });

  it('una base que no existe es 404', async () => {
    const { caso } = montar({ base: null });

    await expect(caso.crear(ACTOR, 'pm-desconocido')).rejects.toThrow(NoEncontrado);
  });

  it('exige `evaluacion.crear`', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
  });

  it('deja constancia en la bitácora, nombrando la base', async () => {
    const { caso, publicados } = montar();

    await caso.crear(ACTOR, 'pm-1');

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('evaluacion.creado');
    expect(publicados[0]?.detalle).toContain('PM-PE-ISI-2026-v2-D-v1');
  });
});

describe('RF-PE-001 RN3 — las bases elegibles', () => {
  it('solo ofrece planes de medición Aprobado o Vigente', async () => {
    // Ofrecer un Borrador llevaría a un 409 al crear. La lista que se enseña y
    // la regla que se aplica tienen que decir lo mismo.
    const { caso, pedidos } = montar({
      listado: [
        planMedicion({ id: 'pm-1', estado: 'Vigente' }),
        planMedicion({ id: 'pm-2', estado: 'Aprobado' }),
      ],
    });

    const bases = await caso.basesElegibles(ACTOR);

    expect(bases.map((b) => b.id)).toEqual(['pm-1', 'pm-2']);
    // Se filtra en la consulta, no en memoria: traer todos para descartar la
    // mayoría es trabajo que la base ya sabe hacer.
    expect(pedidos.filtros).toContainEqual({ estado: 'Vigente' });
  });

  it('exige `evaluacion.leer`', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.basesElegibles(ACTOR)).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-PE-010 a RF-PE-012 — lo que se hereda', () => {
  it('las competencias salen agrupadas por atributo del graduado', async () => {
    const { caso } = montar();

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.grupos[0]?.atributo?.codigo).toBe('AG-I08');
    expect(vista.grupos[0]?.competencias.map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('solo las competencias que el plan de medición declaró, no el catálogo entero', async () => {
    // El plan base tiene dos competencias en su plan de estudios pero solo
    // declaró una a medir. La evaluación evalúa lo que se mide.
    const { caso } = montar({
      base: planMedicion({ competenciaIds: ['c-1'] }),
      competencias: [
        competencia({ id: 'c-1', codigo: 'CPE-01' }),
        competencia({ id: 'c-2', codigo: 'CPE-02' }),
      ],
    });

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.grupos.flatMap((g) => g.competencias).map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('los periodos son los del plan base, en su orden', async () => {
    const { caso } = montar();

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.periodos.map((p) => p.etiqueta)).toEqual(['2026-I', '2026-II']);
  });

  it('RF-PE-012: dice qué combinaciones están programadas', async () => {
    const { caso } = montar();

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.programadas).toEqual(['c-1|p-1']);
  });

  it('el tipo y la meta salen de la base, no de la evaluación', async () => {
    // No se copian al crear: si se copiaran, un cambio en la base los dejaría
    // mintiendo. No pueden cambiar, pero la única forma de garantizarlo es no
    // tener una segunda copia.
    const { caso } = montar({ base: planMedicion({ tipo: 'INDIRECTA', meta: 0.85 }) });

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.base.tipo).toBe('INDIRECTA');
    expect(vista.base.metaPorcentaje).toBe(85);
  });
});

describe('RF-PE-008 — el borrado', () => {
  it('solo en Borrador', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'Vigente' }) });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige `evaluacion.eliminar`', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-PE-005 — las transiciones', () => {
  it('aprobar exige `evaluacion.aprobar`, no `medicion.aprobar`', async () => {
    // Con el permiso escrito entero en la máquina de estados compartida, quien
    // pudiera aprobar mediciones aprobaría también evaluaciones.
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: {
        puede: async (_id, permiso) => {
          pedidos.push(permiso);
          return { permitido: true };
        },
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => null,
      },
      evaluacion: evaluacion({ estado: 'En revisión' }),
    });

    await caso.transicionar(ACTOR, 'ev-1', 'aprobar', {});

    expect(pedidos).toContain('evaluacion.aprobar');
    expect(pedidos).not.toContain('medicion.aprobar');
  });

  it('una transición imposible se rechaza con el motivo', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'Borrador' }) });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('deja constancia del antes y el después', async () => {
    const { caso, publicados } = montar({ evaluacion: evaluacion({ estado: 'Borrador' }) });

    await caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {});

    expect(publicados[0]?.nombre).toBe('evaluacion.transicionado');
    expect(publicados[0]?.detalle).toContain('Borrador → En revisión');
  });
});

describe('RF-PE-044 — el vigente', () => {
  it('devuelve null si no hay ninguno', async () => {
    const { caso } = montar({ vigente: null });

    expect(await caso.vigenteDe(ACTOR, 'pm-1')).toBeNull();
  });
});
```

- [ ] **Step 4: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/evaluacion/application/
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 5: Escribir el caso de uso**

Puntos que las pruebas fijan:

- `basesElegibles(actor)` comprueba `evaluacion.leer` y llama **dos veces** a
  `mediciones.listar`, una con `{ estado: 'Vigente' }` y otra con
  `{ estado: 'Aprobado' }`, concatenando. `FiltroPlanesMedicion.estado` admite
  un estado, no una lista, y **no se amplía el puerto por esto**: dos consultas
  por clave indexada cuestan menos que cambiar una interfaz que ya usan tres
  casos de uso, y filtrar en memoria traería todos los planes para descartar la
  mayoría.
- `crear(actor, planMedicionId)` comprueba `evaluacion.crear`; lee la base por `RepositorioPlanMedicionPort.porId`; **404 si no existe**; **409 si su estado no es Aprobado ni Vigente** —el mensaje nombra el código y el estado—; genera el código con `siguienteCodigoEvaluacion(base.codigo del plan de estudios, base.tipo, await evaluaciones.codigosDe(...))`; crea; emite `PlanEvaluacionCreado`.
  El código del **plan de estudios** se obtiene con `ContenidoCurricularPort.planPorId(base.planEstudiosId)`.
- `porId(actor, id)` comprueba `evaluacion.leer`; arma la `VistaPlanEvaluacion` leyendo el plan base, filtrando las competencias del plan de estudios a las que la base declaró (`base.competenciaIds`), agrupándolas con `agruparPorAtributo`, y trayendo la matriz con `medicion.matriz(base.id)` para componer `programadas` como `` `${competenciaId}|${periodoId}` ``.
- `eliminar(actor, id)` comprueba `evaluacion.eliminar` y `permiteEliminacion(plan.estado)`.
- `transicionar(actor, id, accion, contexto)` usa `describirTransicion(accion)` y exige `` `evaluacion.${transicion.permiso}` ``. **`tieneBloqueos` es siempre `false`**, con este comentario:

```ts
    // La validación integral de consistencia es RF-PE-041, en el ciclo 2c-D:
    // hoy no hay ningún dato de configuración que validar. Pasar `false` no es
    // saltarse la comprobación, es que todavía no existe nada que comprobar.
    const r = intentarTransicion(plan.estado, accion, {
      tieneBloqueos: false,
      comentario: contexto.comentario,
    });
```

- [ ] **Step 6: Verde, y comprobación por mutación**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/
npm test && npm run typecheck && npm run lint && npm run format:check
```

Expected: PASS, 18 pruebas nuevas.

Mutaciones, una a una, restaurando entre ellas:

| Mutación | Prueba que debe fallar |
|---|---|
| Quitar la comprobación de estado de la base en `crear` | «una base que no está Aprobado ni Vigente se rechaza» |
| No filtrar por `base.competenciaIds` en `porId` | «solo las competencias que el plan de medición declaró» |
| Usar `` `medicion.${transicion.permiso}` `` en `transicionar` | «aprobar exige `evaluacion.aprobar`» |

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/prisma/seed.ts
git commit -m "El caso de uso del plan de evaluación

Lee de la base todo lo que hereda: tipo, meta, competencias, periodos y matriz.
Nada se copia, porque un plan de medición Aprobado o Vigente no se edita y una
segunda copia solo podría desincronizarse.

Permisos evaluacion.* propios, asignados a los mismos roles que hoy tienen los
de medición. El Coordinador no aprueba, igual que en medición: quien construye
no da el visto bueno (RF-PE-046)."
```

---

### Task 7: Los endpoints

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/planes-evaluacion.controller.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/dto/evaluacion.dto.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `GestionarPlanesEvaluacion` (Task 6).
- Produces: los endpoints que consume la Task 8.

- [ ] **Step 1: Escribir los DTO**

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { ESTADOS_MEDICION } from '../../../../domain/value-objects/estado-plan.js';

export class CrearPlanEvaluacionDto {
  /** Lo único que se pide: el tipo y la meta los determina la base (RF-PE-001 RN2). */
  @IsUUID()
  planMedicionId!: string;
}

export class FiltroPlanesEvaluacionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() planMedicionId?: string;
  @ApiPropertyOptional({ enum: ['DIRECTA', 'INDIRECTA'] })
  @IsOptional()
  @IsIn(['DIRECTA', 'INDIRECTA'])
  tipo?: 'DIRECTA' | 'INDIRECTA';
  @ApiPropertyOptional({ enum: ESTADOS_MEDICION })
  @IsOptional()
  @IsIn(ESTADOS_MEDICION)
  estado?: (typeof ESTADOS_MEDICION)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) texto?: string;
}

export class TransicionEvaluacionDto {
  @IsIn(['enviar-a-revision', 'aprobar', 'observar', 'marcar-vigente', 'archivar'])
  accion!: 'enviar-a-revision' | 'aprobar' | 'observar' | 'marcar-vigente' | 'archivar';

  @IsOptional() @IsString() @MaxLength(500) comentario?: string;
}
```

- [ ] **Step 2: Escribir el controlador**

Cada método lleva `@ApiOperation` y `@ApiResponse`, como los de medición.

```ts
/**
 * Endpoints del plan de evaluación.
 *
 * `bases-elegibles` se declara ANTES que `:id`, y no es cosmético: Nest resuelve
 * las rutas por orden de declaración, así que con `:id` delante la petición a
 * `/planes-evaluacion/bases-elegibles` entraría por él, `ParseUUIDPipe` la
 * rechazaría, y quien la hizo recibiría un 400 sobre un UUID inválido que no
 * explica nada de lo que ocurrió.
 */

@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-evaluacion')
export class PlanesEvaluacionController {
  constructor(private readonly casos: GestionarPlanesEvaluacion) {}

  @Get('bases-elegibles')
  @ApiOperation({
    summary: 'Planes de medición sobre los que se puede evaluar',
    description: 'RF-PE-001 RN3: solo Aprobado o Vigente.',
  })
  async basesElegibles(@ActorActual() actor: Actor) {
    return this.casos.basesElegibles(actor);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar planes de evaluación (RF-PE-009, RF-PE-043)' })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroPlanesEvaluacionDto) {
    return this.casos.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un plan de evaluación',
    description:
      'RF-PE-001 a RF-PE-003. Solo se pide el plan de medición base: el tipo y ' +
      'la meta los determina él (RF-PE-001 RN2).',
  })
  @ApiResponse({ status: 409, description: 'El plan de medición base no está Aprobado ni Vigente.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearPlanEvaluacionDto) {
    return this.casos.crear(actor, dto.planMedicionId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Un plan de evaluación con lo que hereda',
    description: 'RF-PE-010 a RF-PE-012: competencias agrupadas, periodos y celdas programadas.',
  })
  @ApiResponse({ status: 404, description: 'El plan de evaluación no existe.' })
  async porId(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.casos.porId(actor, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un plan de evaluación en Borrador (RF-PE-008)' })
  @ApiResponse({ status: 409, description: 'El plan no está en Borrador.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.casos.eliminar(actor, id);
  }

  @Post(':id/transiciones')
  @ApiOperation({ summary: 'Cambiar el estado del plan (RF-PE-005)' })
  @ApiResponse({ status: 409, description: 'La transición no cabe desde el estado actual.' })
  async transicionar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: TransicionEvaluacionDto,
  ) {
    return this.casos.transicionar(actor, id, dto.accion, { comentario: dto.comentario });
  }
}

/**
 * Cuelga de `planes-medicion` porque la pregunta es «cuál es la evaluación
 * vigente de ESTE plan de medición», y quien la hace tiene el plan de medición
 * delante, no la evaluación.
 */
@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-medicion/:planMedicionId')
export class EvaluacionVigenteController {
  constructor(private readonly casos: GestionarPlanesEvaluacion) {}

  @Get('evaluacion-vigente')
  @ApiOperation({
    summary: 'El plan de evaluación vigente de un plan de medición (RF-PE-044)',
    description: 'Devuelve null si no hay ninguno; RN1 garantiza que no haya dos.',
  })
  async vigente(
    @Param('planMedicionId', ParseUUIDPipe) planMedicionId: string,
    @ActorActual() actor: Actor,
  ) {
    return this.casos.vigenteDe(actor, planMedicionId);
  }
}
```

- [ ] **Step 3: Cablear en `app.module.ts`**

Registra los dos controladores en `controllers`, y el proveedor por fábrica junto a los de medición:

```ts
    { provide: REPOSITORIO_PLAN_EVALUACION, useClass: PlanEvaluacionRepositoryPrisma },
    {
      provide: GestionarPlanesEvaluacion,
      inject: [
        REPOSITORIO_PLAN_EVALUACION,
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        evaluaciones: RepositorioPlanEvaluacionPort,
        mediciones: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new GestionarPlanesEvaluacion(evaluaciones, mediciones, curricular, autorizacion, eventos),
    },
```

- [ ] **Step 4: Comprobar contra la API levantada**

Este paso encuentra lo que el typecheck no ve: el cableado de inyección y la forma real de la respuesta. En el ciclo anterior destapó que el token del worker no estaba exportado y que `tsx` no emite metadatos de decorador.

```bash
cd apps/api && npm run build
export $(grep -E '^(DATABASE_URL|JWT_SECRET|REDIS_URL|DOCUMENTOS_DIR)=' .env | tr -d '"' | tr '\n' ' ')
THROTTLE_LIMIT=10000 node dist/main.js > /tmp/api.log 2>&1 &
```

Con un token de `e2e-editor@sgc.local` (contraseña `E2E.Pruebas.2026!`):

```bash
API=http://localhost:3000/api/v1
curl -s "$API/planes-evaluacion/bases-elegibles" -H "authorization: Bearer $TOKEN"
curl -s -X POST "$API/planes-evaluacion" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"planMedicionId":"<id de uno vigente>"}'
curl -s "$API/planes-evaluacion" -H "authorization: Bearer $TOKEN"
curl -s "$API/planes-evaluacion/<id>" -H "authorization: Bearer $TOKEN"
```

Expected: `bases-elegibles` devuelve **200 y una lista**, no un 400 de UUID —si da 400, el orden de declaración de rutas está mal—; el POST devuelve 201 con `estado: "Borrador"` y un código que empieza por `EV-`; el detalle trae `grupos`, `periodos` y `programadas`.

Comprueba también los errores: POST con un `planMedicionId` de un plan en Borrador → **409** con el estado en el mensaje; POST sin token → **401**.

- [ ] **Step 5: Verificar y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
git add apps/api/src
git commit -m "Los endpoints del plan de evaluación

bases-elegibles se declara antes que :id: Nest resuelve por orden y si no, la
ruta entra por el ParseUUIDPipe y devuelve un 400 que no explica nada."
```

---

### Task 8: Las pantallas

**Files:**
- Modify: `apps/web/src/features/mejora-continua/domain/tipos.ts`
- Create: `apps/web/src/features/mejora-continua/api/evaluacion.api.ts`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts`
- Create: `apps/web/src/features/mejora-continua/pages/PlanesEvaluacionPage.tsx`
- Create: `apps/web/src/features/mejora-continua/pages/PlanEvaluacionPage.tsx`
- Create: `apps/web/src/features/mejora-continua/components/HeredadoDelPlanBase.tsx`
- Test: `apps/web/src/features/mejora-continua/components/HeredadoDelPlanBase.test.tsx`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: los endpoints de la Task 7.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Tipos y capa de datos**

En `tipos.ts`:

```ts
export interface PlanEvaluacion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly codigo: string;
  readonly version: number;
  readonly estado: EstadoMedicion;
  readonly creadoEn: string;
}

export interface VistaPlanEvaluacion {
  readonly plan: PlanEvaluacion;
  readonly base: { id: string; codigo: string; tipo: TipoMedicion; metaPorcentaje: number };
  readonly grupos: readonly GrupoCompetencias[];
  readonly periodos: readonly { id: string; etiqueta: string; orden: number }[];
  /** «competenciaId|periodoId» de las combinaciones programadas (RF-PE-012). */
  readonly programadas: readonly string[];
}
```

En `evaluacion.api.ts`, las seis llamadas: `basesElegibles`, `listarEvaluaciones`, `obtenerEvaluacion`, `crearEvaluacion`, `eliminarEvaluacion`, `transicionarEvaluacion`.

En `queries.ts`, las claves y los hooks, con **la misma protección contra escrituras que se pisan** que se añadió a medición:

```ts
export const clavesEval = {
  lista: (f?: FiltroEvaluaciones) => ['evaluacion', 'lista', f?.planMedicionId ?? 'todos', f?.estado ?? 'todos'] as const,
  plan: (id: string) => ['evaluacion', id] as const,
};

function useMutacionDeEvaluacion<TVars, TDatos>(id: string, fn: (v: TVars) => Promise<TDatos>) {
  const qc = useQueryClient();
  return useMutation({
    // Las escrituras sobre un mismo plan van en fila, nunca en paralelo: todas
    // son lee-modifica-escribe sobre el plan entero, y dos en vuelo a la vez se
    // resuelven por orden de llegada, que no lo decide el cliente.
    scope: { id: `plan-evaluacion:${id}` },
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: clavesEval.plan(id) });
      await qc.invalidateQueries({ queryKey: ['evaluacion', 'lista'] });
    },
  });
}
```

- [ ] **Step 2: Escribir la prueba del componente en rojo**

`HeredadoDelPlanBase.test.tsx`:

```tsx
/** @vitest-environment jsdom */

/**
 * RF-PE-010 a RF-PE-012 en pantalla: lo que el plan de evaluación hereda.
 *
 * Se enseña en solo lectura porque no se edita desde aquí (RF-PE-010 RN1 y
 * RF-PE-011 RN1). Lo que se vigila es que se vea de dónde viene y qué
 * combinaciones están programadas — sin eso, la pantalla parecería un
 * formulario a medio hacer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeredadoDelPlanBase } from './HeredadoDelPlanBase';

const VISTA = {
  base: { id: 'pm-1', codigo: 'PM-PE-ISI-2026-v2-D-v1', tipo: 'DIRECTA' as const, metaPorcentaje: 70 },
  grupos: [
    {
      atributo: { id: 'a1', codigo: 'AG-I08', nombre: 'Análisis de Problema' },
      competencias: [{ id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas' }],
    },
  ],
  periodos: [
    { id: 'p-1', etiqueta: '2026-I', orden: 1 },
    { id: 'p-2', etiqueta: '2026-II', orden: 2 },
  ],
  programadas: ['c-1|p-1'],
};

describe('lo heredado', () => {
  it('dice de qué plan de medición viene', () => {
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByText(/PM-PE-ISI-2026-v2-D-v1/)).toBeInTheDocument();
  });

  it('las competencias van agrupadas por atributo', () => {
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByText(/AG-I08/)).toBeInTheDocument();
    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
  });

  it('no ofrece ni una casilla: aquí no se edita nada', () => {
    // RF-PE-010 RN1 y RF-PE-011 RN1: las competencias y los periodos no se
    // añaden ni se quitan desde el plan de evaluación.
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('distingue la combinación programada de la que no lo está', () => {
    // RF-PE-012: solo se podrá configurar donde el plan de medición programó.
    // Si las dos se vieran igual, en 2c-B nadie entendería por qué una casilla
    // se deja rellenar y la de al lado no.
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByLabelText('CPE-01 en 2026-I: programada')).toBeInTheDocument();
    expect(screen.getByLabelText('CPE-01 en 2026-II: no programada')).toBeInTheDocument();
  });

  it('avisa de que la configuración llega después', () => {
    // Una zona en blanco parece un fallo de carga. Decirlo es información.
    render(<HeredadoDelPlanBase vista={VISTA} />);

    expect(screen.getByText(/se configura en el siguiente ciclo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/HeredadoDelPlanBase.test.tsx
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 4: Escribir el componente y las dos páginas**

`HeredadoDelPlanBase.tsx`: una cabecera con el plan base, tipo y meta; una cuadrícula competencia × periodo, agrupada por atributo, donde cada celda lleva `aria-label={\`${codigo} en ${etiqueta}: ${programada ? 'programada' : 'no programada'}\`}`; y una nota de que la configuración llega en el siguiente ciclo.

`PlanesEvaluacionPage.tsx` y `PlanEvaluacionPage.tsx` calcan `PlanesMedicionPage.tsx` y `PlanMedicionPage.tsx`: listado con filtros y modal de alta que solo pide el plan de medición base; detalle con datos generales, `Badge` de estado, botones de transición filtrados por `` puede(`evaluacion.${describirTransicion(a).permiso}`) ``, y la tarjeta de lo heredado.

Ruta en `App.tsx` (`/mejora-continua/evaluacion` y `/:id`) y entrada de menú en `AppLayout.tsx` con `permiso: 'evaluacion.leer'`.

- [ ] **Step 5: Verde y comprobación por mutación**

```bash
cd apps/web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
```

Expected: PASS, 5 pruebas nuevas (187 en total).

Mutación: haz que todas las celdas digan «programada». Debe fallar «distingue la combinación programada». Restaura.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "Las pantallas del plan de evaluación

Lo heredado se enseña en solo lectura —no se edita desde aquí, RF-PE-010 RN1 y
RF-PE-011 RN1— y las combinaciones programadas se distinguen de las que no lo
están: en 2c-B es lo que decide qué casilla se deja rellenar."
```

---

### Task 9: E2E y cierre

**Files:**
- Create: `tests/e2e/specs/evaluacion.spec.ts`
- Modify: `apps/api/scripts/preparar-e2e.ts`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: todo lo anterior; el fixture `test` de `tests/e2e/fixtures/sesion.ts`.
- Produces: nada.

- [ ] **Step 1: Dejar un plan de medición aprobado en los datos de prueba**

`preparar-e2e.ts` deja hoy un plan de medición **vigente**. RF-PE-001 RN3 admite Aprobado o Vigente, así que el vigente ya sirve como base. Comprueba que existe y anota su código; si no lo hubiera, añádelo con el mismo patrón que el resto del guion.

- [ ] **Step 2: Escribir el recorrido**

```ts
/**
 * RF-PE-001 a RF-PE-012 contra la aplicación entera.
 *
 * Lo que solo se ve aquí: que el plan de evaluación lea de verdad las
 * competencias y los periodos del plan de medición base —no de una copia— y que
 * el ciclo de vida funcione de punta a punta.
 */

import { expect, test } from '../fixtures/sesion';

test('crear un plan de evaluación sobre un plan de medición vigente', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');

  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de medición base*').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  // El código empieza por EV- y nunca por PE-, que es el prefijo del plan de
  // estudios y va dentro del propio código.
  const enlace = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();

  // Un encabezado que solo existe en el detalle: `toHaveURL` casa en el
  // instante de navegar, cuando React todavía no ha cambiado el contenido.
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
});

test('el detalle enseña lo heredado, y no deja tocarlo', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Heredado del plan de medición' })).toBeVisible();
  await expect(page.getByText(/CPE-E2E01/)).toBeVisible();

  // RF-PE-010 RN1 y RF-PE-011 RN1: desde aquí no se añaden ni se quitan.
  await expect(page.locator('main').getByRole('checkbox')).toHaveCount(0);
});

test('el ciclo de vida avanza y queda en la bitácora', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar a revisión' }).click();

  await expect(page.locator('main').getByText('En revisión', { exact: true }).first()).toBeVisible();
});
```

- [ ] **Step 3: Ejecutar con la API compilada**

```bash
cd apps/api && npm run e2e:preparar && npm run build
export $(grep -E '^(DATABASE_URL|JWT_SECRET|REDIS_URL|DOCUMENTOS_DIR)=' .env | tr -d '"' | tr '\n' ' ')
THROTTLE_LIMIT=10000 node dist/main.js > /tmp/api.log 2>&1 &
node dist/worker.js > /tmp/worker.log 2>&1 &
cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

Expected: PASS, 27 pruebas (24 + 3).

**Si algún selector no encuentra su elemento, corrige el selector, no la interfaz.** Y antes de dar por bueno un recorrido nuevo, comprueba que no es vacuo: rómpelo a propósito —por ejemplo, haciendo que el detalle no pinte lo heredado— y confirma que falla.

**Si el login da 429:** son cinco por minuto y la suite gasta dos por ejecución. Espera un minuto.

- [ ] **Step 4: Actualizar el recuento y el estado**

En `CLAUDE.md`, la tabla de avance: `Mejora Continua · Evaluación (RF-PE)` pasa de `0 | 49` a `17 | 49`, y el total de **120 de 243** a **137 de 243**, un 56 %. Ajusta también la fecha.

En `README.md`, sección «Estado», añade el plan de evaluación a lo que funciona hoy, con las cifras de pruebas reales tras este ciclo.

- [ ] **Step 5: Verificar todo y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
cd ../../tests/e2e && npm run typecheck && npm run format:check
cd /d/App-ICACIT
git add tests/e2e apps/api/scripts README.md CLAUDE.md
git commit -m "El plan de evaluación, de punta a punta

Tres recorridos: el alta sobre un plan de medición vigente, el detalle con lo
heredado en solo lectura, y el ciclo de vida. Cierra 2c-A: 17 de los 49 RF-PE."
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §2 referenciar, no copiar | Tasks 5 y 6 |
| §3 subcarpeta por submódulo | Task 1 |
| §3 el permiso deja de traer prefijo | Task 2 |
| §4 la tabla y su índice parcial | Task 3 |
| §5 ningún puerto nuevo hacia medición | Task 6, Step 5 |
| §6 el código `EV-` | Task 4 |
| §6 los métodos del caso de uso | Task 6 |
| §7 los endpoints y el orden de las rutas | Task 7 |
| §8 las pantallas | Task 8 |
| §9 permisos y auditoría | Task 6, Steps 1 y 2 |
| §10 errores | Task 6 (dominio) y Task 7, Step 4 (HTTP) |
| §11 pruebas | Todas; las comprobaciones por mutación en 2, 4, 5, 6, 8 y 9 |
| §13 lo que no resuelve | No requiere código: son las decisiones de 2c-B |
