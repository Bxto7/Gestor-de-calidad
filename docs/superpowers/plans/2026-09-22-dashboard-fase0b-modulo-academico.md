# Fase 0b — Módulo `academico` (Facultad + Carrera + Ciclo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar Facultad, Carrera y Ciclo del módulo `plan-estudios` hacia
un módulo `academico` de primer nivel, con el mismo aislamiento por
puerto cross-módulo que ya existe entre `plan-estudios` y
`mejora-continua`, sin perder ninguna FK real de Postgres ni romper el
único caso donde `plan-estudios` necesitaba algo de `GestionarCarreras`
en la dirección "de adentro hacia afuera" (histórico de versiones de un
plan por carrera).

**Architecture:** Módulo nuevo `academico/` con `domain/application/infrastructure`
propios; un puerto cross-módulo (`academico-cross-modulo.port.ts`) es la
única vía por la que `plan-estudios` puede seguir consultando carreras.
La ruta `GET /carreras/:id/versiones` — que depende de `GestionarPlanes`,
de `plan-estudios` — se queda en `plan-estudios`, en un controller propio
nuevo, en vez de viajar con el resto de `CarrerasController`: moverla
habría invertido el sentido de la dependencia entre los dos módulos.

**Tech Stack:** NestJS + Prisma 7 (`multiSchema`) + Vitest, sin
dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-22-dashboard-fase0-fundacion-design.md`
(§2.4, §2.6, §4.1 — segunda de las cinco piezas de la Fase 0; la primera,
rol en `auth`, es un plan aparte y no es un prerrequisito de código para
este).

## Global Constraints

- TypeScript estricto, sin `any` sin justificar (CLAUDE.md §2).
- Un módulo nunca importa el repositorio ni las entidades de otro
  directamente — solo por puerto expuesto explícitamente (CLAUDE.md §3.1,
  regla no negociable). Este plan es, en gran parte, la aplicación
  literal de esa regla a una relación que hoy vive dentro de un solo
  módulo.
- Las migraciones de base de datos van siempre por Prisma Migrate, nunca
  cambios manuales al esquema (CLAUDE.md §2).
- Cobertura `domain/`/`application/` ≥80% (RNF del proyecto) — el CRUD
  movido ya tiene su cobertura; se preserva, no se re-audita de cero.
- Nomenclatura: entidades y casos de uso en español, coherente con el
  resto del dominio.

---

### Task 1: Migración de Prisma — `Facultad`/`Carrera`/`Ciclo` al schema `academico`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_mueve_facultad_carrera_ciclo_a_academico/migration.sql`
  (generado por `prisma migrate dev`, no escrito a mano — ver Step 3)

**Interfaces:**
- Produces: los modelos `Facultad`/`Carrera`/`Ciclo` viven en
  `@@schema("academico")`; las FKs hacia ellos desde `plan_estudios`
  (`PlanEstudios.carreraId`, `CriterioAcreditacion.carreraId`,
  `Asignatura.cicloId`, `GrupoElectivo.cicloId`) se mantienen reales,
  cruzando schema. Consumido por todas las tareas siguientes.

Esta tarea es solo de esquema — no toca ningún archivo `.ts` todavía. Se
hace primero porque las Tasks 2-4 escriben código Prisma (`this.prisma.facultad...`)
que ya asume el modelo en su ubicación final.

- [ ] **Step 1: Agregar el schema `academico` al datasource**

En `apps/api/prisma/schema.prisma`, la línea del datasource dice hoy:

```prisma
  schemas  = ["auth", "plan_estudios", "auditoria", "mejora_continua"]
```

Cambiarla a:

```prisma
  schemas  = ["auth", "plan_estudios", "auditoria", "mejora_continua", "academico"]
```

- [ ] **Step 2: Mover `Facultad`, `Carrera`, `Ciclo` y actualizar las 4 FKs cruzadas**

Los tres modelos están hoy en `apps/api/prisma/schema.prisma`, líneas
241-304 (`model Facultad`, `model Carrera`, `model Ciclo`, en ese orden,
consecutivos). Cambiar, en los tres, `@@schema("plan_estudios")` por
`@@schema("academico")` — nada más del cuerpo de esos tres modelos
cambia.

Las 4 FKs que cruzan desde `plan_estudios` no necesitan ningún cambio de
sintaxis (Prisma `multiSchema` permite `@relation` entre modelos de
schemas distintos sin marcarlo aparte) — pero confirmar, después del
Step 3, que las 4 siguen presentes y sin advertencias:

1. `PlanEstudios.carreraId → Carrera.id` (línea ~326 hoy, `onDelete: Restrict`)
2. `CriterioAcreditacion.carreraId → Carrera.id` (línea ~471 hoy, `onDelete: Restrict`)
3. `Asignatura.cicloId → Ciclo.id` (línea ~573 hoy, `onDelete: SetNull`, nullable)
4. `GrupoElectivo.cicloId → Ciclo.id` (línea ~532 hoy, `onDelete: Restrict`)

- [ ] **Step 3: Generar la migración**

```bash
cd apps/api && npx prisma migrate dev --name mueve_facultad_carrera_ciclo_a_academico
```

Expected: Prisma genera un `migration.sql` con `CREATE SCHEMA "academico"`
seguido de `ALTER TABLE "plan_estudios"."facultades" SET SCHEMA "academico"`
(y lo mismo para `carreras`/`ciclos`) — **no** un `DROP`/`CREATE TABLE`.
Si el SQL generado hace un drop-and-recreate en vez de `SET SCHEMA`, no lo
apliques: es señal de que Prisma no reconoció el movimiento como tal (por
ejemplo, por un typo en el nombre del schema) — revisa el Step 2 antes de
continuar.

Revisar a mano el archivo generado antes de que este comando lo aplique
(corre igual, `prisma migrate dev` aplica y genera en el mismo paso; si
el SQL no es el esperado, `prisma migrate resolve --rolled-back
<nombre>` y corregir el Step 2 antes de reintentar).

- [ ] **Step 4: Regenerar el cliente y confirmar que el resto del proyecto sigue compilando**

```bash
cd apps/api && npx prisma generate
cd apps/api && npx tsc --noEmit -p tsconfig.json
```

Expected: `prisma generate` sin errores. `tsc` **va a fallar** — es
esperado, todavía no se tocó ningún archivo `.ts` que use
`this.prisma.facultad`/`.carrera`/`.ciclo` con el nuevo tipo generado
(el error, si aparece, sería de tipos incompatibles en el cliente
generado, no de la migración en sí; si `tsc` está limpio en este punto,
también está bien — depende de si el tipo de retorno cambió de forma
visible).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(academico): migra Facultad/Carrera/Ciclo al schema academico (Fase 0b)"
```

---

### Task 2: Puertos y casos de uso del módulo `academico`

**Files:**
- Create: `apps/api/src/modules/academico/domain/value-objects/codigos.ts`
- Create: `apps/api/src/modules/academico/application/ports/academico.port.ts`
- Create: `apps/api/src/modules/academico/application/ports/academico-cross-modulo.port.ts`
- Create: `apps/api/src/modules/academico/application/use-cases/gestionar-facultades.use-case.ts`
- Create: `apps/api/src/modules/academico/application/use-cases/gestionar-carreras.use-case.ts`
- Create: `apps/api/src/modules/academico/domain/events/eventos-academico.ts`
- Test: `apps/api/src/modules/academico/application/use-cases/gestionar-facultades.spec.ts`
- Test: `apps/api/src/modules/academico/application/use-cases/gestionar-carreras.spec.ts`
- Delete (al final de la Task 4, no aquí): los 4 archivos originales en
  `plan-estudios` — se listan en la Task 4 para no dejar el proyecto sin
  compilar a mitad de esta tarea.

**Interfaces:**
- Consumes: nada de otras tareas de este plan.
- Produces: `GestionarFacultades`, `GestionarCarreras`,
  `RepositorioFacultadPort`, `RepositorioCarreraPort`,
  `DatosFacultad`, `DatosCarreraCompleta`, `DatosNuevaCarrera`,
  `REPOSITORIO_FACULTAD`, `REPOSITORIO_CARRERA` (mismos nombres y formas
  que hoy en `plan-estudios/application/ports/estructura.port.ts`, solo
  cambia el paquete). `AcademicoCrossModuloPort` con
  `carreraPorId(id): Promise<DatosCarreraResumen | null>` y
  `carrerasActivas(): Promise<DatosCarreraResumen[]>` — consumido por la
  Task 3 (adaptador) y por `plan-estudios` una vez que la Task 4 quite su
  copia local de `GestionarCarreras`.

Esta tarea trabaja **en paralelo** al código viejo de `plan-estudios`
(no lo borra todavía) — el proyecto compila con ambos coexistiendo hasta
la Task 4, que hace el recableo final y borra lo viejo en el mismo
commit que agrega lo nuevo a `app.module.ts`.

- [ ] **Step 1: Crear la copia local de `limpiarNombre`**

`GestionarCarreras` usa `limpiarNombre` — hoy vive en
`plan-estudios/domain/value-objects/codigos.ts`, una función pura sin
ningún import (confirmado leyendo el archivo completo antes de escribir
este plan). Su propio comentario de cabecera ya dice que se
"comparte literalmente con el frontend" — es decir, la duplicación
deliberada de esta función puntual ya es el patrón establecido del
proyecto para cruzarla a otro contexto, en vez de importarla. Se aplica
el mismo criterio hacia `academico`: una copia local, no un import
cruzado (que además el test de aislamiento de la Task 5 rechazaría) ni
un movimiento a `shared-kernel/` (desproporcionado para una función de 3
líneas, y CLAUDE.md §"Qué NO hacer" advierte contra convertir
`shared-kernel/` en cajón de sastre).

```typescript
// apps/api/src/modules/academico/domain/value-objects/codigos.ts

/**
 * Copia deliberada de `limpiarNombre` en `plan-estudios/domain/value-objects/codigos.ts`
 * — mismo criterio que ese archivo ya declara para el frontend ("compartido
 * literalmente"): es una función pura de 3 líneas, sin dependencias: duplicarla
 * es más simple y más aislado que importarla cruzando el módulo o moverla a
 * `shared-kernel/` para un solo consumidor más.
 */
export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
```

- [ ] **Step 2: Crear el puerto `academico.port.ts`**

Copiar el contenido completo de
`apps/api/src/modules/plan-estudios/application/ports/estructura.port.ts`
a `apps/api/src/modules/academico/application/ports/academico.port.ts`,
sin cambiar una sola línea de su cuerpo — es un archivo nuevo con el
mismo contenido exacto que el original (que se borra en la Task 4).

- [ ] **Step 3: Crear el puerto cross-módulo**

```typescript
// apps/api/src/modules/academico/application/ports/academico-cross-modulo.port.ts

/**
 * Lo único que `plan-estudios` puede saber de `academico` (CLAUDE.md §3.1):
 * datos planos de una carrera, nunca su repositorio ni su entidad completa.
 * Mismo criterio que `acreditacion-cross-modulo.port.ts` ya usa entre
 * `mejora-continua` y `plan-estudios`.
 *
 * Hoy el único consumo real es crear un plan de estudios (necesita saber
 * que la carrera existe) y listar planes por carrera — nada que justifique
 * exponer más que esto.
 */

export interface DatosCarreraResumen {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly activa: boolean;
}

export interface AcademicoCrossModuloPort {
  carreraPorId(id: string): Promise<DatosCarreraResumen | null>;
  carrerasActivas(): Promise<DatosCarreraResumen[]>;
}

export const ACADEMICO_CROSS_MODULO = Symbol('AcademicoCrossModuloPort');
```

- [ ] **Step 4: Crear los eventos**

Copiar el contenido completo de
`apps/api/src/modules/plan-estudios/domain/events/eventos-estructura.ts`
a `apps/api/src/modules/academico/domain/events/eventos-academico.ts`, sin
cambios — mismas 6 clases (`FacultadCreada`, `FacultadEditada`,
`FacultadEstadoCambiada`, `CarreraCreada`, `CarreraEditada`,
`CarreraEstadoCambiado`).

- [ ] **Step 5: Escribir los tests que fallan (movidos, con imports actualizados)**

Copiar `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-estructura.spec.ts`
a DOS archivos nuevos:

- `apps/api/src/modules/academico/application/use-cases/gestionar-facultades.spec.ts`
  — con solo los `describe`/`it` que prueban `GestionarFacultades`.
- `apps/api/src/modules/academico/application/use-cases/gestionar-carreras.spec.ts`
  — con solo los que prueban `GestionarCarreras`.

En ambos, actualizar los imports relativos: donde el original decía
`from '../ports/estructura.port.js'` pasa a
`from '../ports/academico.port.js'`; donde decía
`from '../../domain/events/eventos-estructura.js'` pasa a
`from '../../domain/events/eventos-academico.js'`; el import de
`AuthorizationPort` (`from '../../../auth/application/ports/authorization.port.js'`)
sube un nivel menos de profundidad porque `academico/` está al mismo
nivel que `plan-estudios/` dentro de `modules/`
(`from '../../../auth/application/ports/authorization.port.js'` se
mantiene igual — ambos módulos están al mismo nivel bajo `modules/`, la
ruta relativa no cambia). Ningún caso de prueba cambia de contenido.

- [ ] **Step 6: Correr los tests y verificar que fallan**

Run: `cd apps/api && npx vitest run src/modules/academico`
Expected: FAIL — `Cannot find module '../../application/use-cases/gestionar-facultades.use-case.js'`
(y lo mismo para `gestionar-carreras`).

- [ ] **Step 7: Crear `gestionar-facultades.use-case.ts`**

```typescript
// apps/api/src/modules/academico/application/use-cases/gestionar-facultades.use-case.ts

/**
 * Casos de uso de facultades (RF001–RF008).
 *
 * Movido de `plan-estudios` (Fase 0b del dashboard por rol): la estructura
 * académica es institucional, no del dominio de planes de estudio — ver
 * §2.4 del spec de Fase 0.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { FacultadCreada, FacultadEditada, FacultadEstadoCambiada } from '../../domain/events/eventos-academico.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type { DatosFacultad, RepositorioFacultadPort } from '../ports/academico.port.js';

export class GestionarFacultades {
  constructor(
    private readonly facultades: RepositorioFacultadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF003 / RF007: listado con búsqueda y filtro de estado. */
  async listar(
    actor: Actor,
    filtro?: { texto?: string; activa?: boolean },
  ): Promise<DatosFacultad[]> {
    await this.exigir(actor, 'facultad.leer');
    return this.facultades.listar(filtro);
  }

  /** RF001: RN2 dice que toda facultad nace Activa; el repositorio lo asegura. */
  async crear(actor: Actor, nombre: string): Promise<DatosFacultad> {
    await this.exigir(actor, 'facultad.crear');

    const limpio = limpiarNombre(nombre);
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre de la facultad es obligatorio.');

    // RF006: se comprueba aquí para dar un mensaje útil. El índice único de la
    // migración es lo que realmente lo impide bajo concurrencia.
    if (await this.facultades.existeNombre(limpio)) {
      throw new ReglaDeNegocioViolada('Ya existe una facultad con ese nombre.');
    }

    const facultad = await this.facultades.crear(limpio);
    await this.eventos.publicar([new FacultadCreada(actor, facultad.id, limpio)]);
    return facultad;
  }

  /** RF002: RN1 prohíbe dejar el nombre vacío; RN2 exige registrar el cambio. */
  async renombrar(actor: Actor, id: string, nombre: string): Promise<DatosFacultad> {
    await this.exigir(actor, 'facultad.editar');

    const actual = await this.facultades.porId(id);
    if (!actual) throw new NoEncontrado('la facultad', id);

    const limpio = limpiarNombre(nombre);
    if (!limpio) throw new ReglaDeNegocioViolada('No se permite dejar el nombre vacío.');
    if (await this.facultades.existeNombre(limpio, id)) {
      throw new ReglaDeNegocioViolada('Ya existe otra facultad con ese nombre.');
    }

    const facultad = await this.facultades.renombrar(id, limpio);
    await this.eventos.publicar([new FacultadEditada(actor, id, actual.nombre, limpio)]);
    return facultad;
  }

  /**
   * RF005: cambia el estado sin eliminar nada. RN1 y RN2 son explícitas: el
   * registro no se borra y las carreras y planes siguen consultables.
   *
   * Devuelve también el impacto para que la UI pueda advertirlo, en vez de
   * hacer que el cliente lo consulte por su cuenta y arriesgue mostrar un dato
   * desfasado respecto de lo que acaba de ocurrir.
   */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosFacultad> {
    await this.exigir(actor, 'facultad.inactivar');

    const actual = await this.facultades.porId(id);
    if (!actual) throw new NoEncontrado('la facultad', id);

    const facultad = await this.facultades.cambiarEstado(id, activa);
    await this.eventos.publicar([new FacultadEstadoCambiada(actor, id, actual.nombre, activa)]);
    return facultad;
  }

  /** RF005: consulta previa, para que la confirmación diga qué está en juego. */
  async impactoDeInactivar(actor: Actor, id: string) {
    await this.exigir(actor, 'facultad.leer');
    const existe = await this.facultades.porId(id);
    if (!existe) throw new NoEncontrado('la facultad', id);
    return this.facultades.impactoDeInactivar(id);
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    // Sin carrera: la estructura académica es institucional, no de una carrera.
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 8: Crear `gestionar-carreras.use-case.ts`**

```typescript
// apps/api/src/modules/academico/application/use-cases/gestionar-carreras.use-case.ts

/**
 * Casos de uso de carreras (RF009–RF019).
 *
 * Movido de `plan-estudios` (Fase 0b del dashboard por rol) — ver §2.4 del
 * spec de Fase 0. Separado de `GestionarFacultades` (antes vivían en el
 * mismo archivo) porque, ya en su propio módulo, ya no comparten el
 * mismo motivo de cohesión que tenían dentro de `plan-estudios`
 * ("estructura académica" como concepto único) — cada uno es su propia
 * unidad ahora.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  CarreraCreada,
  CarreraEditada,
  CarreraEstadoCambiado,
} from '../../domain/events/eventos-academico.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosCarreraCompleta,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../ports/academico.port.js';

export interface DatosCarreraEntrada {
  readonly nombre: string;
  readonly codigo: string;
  readonly duracionAnios: number;
}

export class GestionarCarreras {
  constructor(
    private readonly carreras: RepositorioCarreraPort,
    private readonly facultades: RepositorioFacultadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF013 / RF016: filtros combinables. */
  async listar(
    actor: Actor,
    filtro?: { facultadId?: string; texto?: string; activa?: boolean },
  ): Promise<DatosCarreraCompleta[]> {
    await this.exigir(actor, 'carrera.leer');
    return this.carreras.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.leer');
    const carrera = await this.carreras.porId(id);
    if (!carrera) throw new NoEncontrado('la carrera', id);
    return carrera;
  }

  async crear(
    actor: Actor,
    facultadId: string,
    datos: DatosCarreraEntrada,
  ): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.crear');

    const facultad = await this.facultades.porId(facultadId);
    if (!facultad) throw new NoEncontrado('la facultad', facultadId);

    // RF004: una facultad inactiva no admite carreras nuevas. Las existentes
    // siguen operando; lo que se corta es el alta.
    if (!facultad.activa) {
      throw new ReglaDeNegocioViolada('La facultad está inactiva y no admite nuevas carreras.');
    }

    const limpio = this.validar(datos);
    await this.exigirUnicidad(facultadId, limpio);

    const carrera = await this.carreras.crear({ facultadId, ...limpio });
    // RF011: los ciclos nacen con la carrera, dos por año.
    await this.carreras.sincronizarCiclos(carrera.id, limpio.duracionAnios * 2);

    await this.eventos.publicar([new CarreraCreada(actor, carrera.id, carrera.nombre)]);
    return carrera;
  }

  async editar(
    actor: Actor,
    id: string,
    datos: DatosCarreraEntrada,
  ): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.editar');

    const actual = await this.carreras.porId(id);
    if (!actual) throw new NoEncontrado('la carrera', id);

    const limpio = this.validar(datos);
    await this.exigirUnicidad(actual.facultadId, limpio, id);

    // RF012 RN1: reducir los ciclos dejaría asignaturas en ciclos inexistentes.
    // Se comprueba ANTES de tocar nada; hacerlo después obligaría a deshacer.
    const ciclosNuevos = limpio.duracionAnios * 2;
    if (ciclosNuevos < actual.duracionAnios * 2) {
      const huerfanas = await this.carreras.asignaturasSobreCiclo(id, ciclosNuevos);
      if (huerfanas > 0) {
        throw new ReglaDeNegocioViolada(
          `No se puede reducir a ${ciclosNuevos} ciclos: ${huerfanas} asignatura(s) están ` +
            'ubicadas en ciclos que dejarían de existir.',
        );
      }
    }

    const carrera = await this.carreras.actualizar(id, limpio);
    await this.carreras.sincronizarCiclos(id, ciclosNuevos);

    await this.eventos.publicar([new CarreraEditada(actor, id, carrera.nombre)]);
    return carrera;
  }

  /** RF018: inactivar sin eliminar; el histórico se conserva. */
  async cambiarEstado(actor: Actor, id: string, activa: boolean): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.inactivar');

    const actual = await this.carreras.porId(id);
    if (!actual) throw new NoEncontrado('la carrera', id);

    const carrera = await this.carreras.cambiarEstado(id, activa);
    await this.eventos.publicar([new CarreraEstadoCambiado(actor, id, carrera.nombre, activa)]);
    return carrera;
  }

  private validar(datos: DatosCarreraEntrada): DatosCarreraEntrada {
    const nombre = limpiarNombre(datos.nombre);
    const codigo = limpiarNombre(datos.codigo).toUpperCase();

    if (!nombre) throw new ReglaDeNegocioViolada('El nombre de la carrera es obligatorio.');
    if (!codigo) throw new ReglaDeNegocioViolada('El código de la carrera es obligatorio.');
    // RF011 RN1: entero positivo.
    if (!Number.isInteger(datos.duracionAnios) || datos.duracionAnios < 1) {
      throw new ReglaDeNegocioViolada(
        'La duración debe ser un número entero de años mayor a cero.',
      );
    }

    return { nombre, codigo, duracionAnios: datos.duracionAnios };
  }

  private async exigirUnicidad(
    facultadId: string,
    datos: DatosCarreraEntrada,
    idIgnorado?: string,
  ): Promise<void> {
    // RF015 RN1: el nombre puede repetirse entre facultades, no dentro de una.
    if (await this.carreras.existeNombreEnFacultad(facultadId, datos.nombre, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe una carrera con ese nombre en esta facultad.');
    }
    // RF017 RN1: el código sí es único en toda la universidad, porque de él
    // cuelgan los códigos de planes y asignaturas.
    if (await this.carreras.existeCodigo(datos.codigo, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe una carrera con ese código en la universidad.');
    }
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 9: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/academico`
Expected: PASS, todos los casos migrados de `gestionar-estructura.spec.ts`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/academico
git commit -m "feat(academico): puertos, casos de uso y eventos del módulo académico (Fase 0b)"
```

---

### Task 3: Repositorio Prisma y adaptador cross-módulo de `academico`

**Files:**
- Create: `apps/api/src/modules/academico/infrastructure/persistence/academico.repository.ts`
- Create: `apps/api/src/modules/academico/infrastructure/academico-cross-modulo.adapter.ts`
- Test: `apps/api/test/integration/academico.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioFacultadPort`, `RepositorioCarreraPort` (Task 2);
  `AcademicoCrossModuloPort`, `DatosCarreraResumen` (Task 2).
- Produces: `FacultadRepositoryPrisma`, `CarreraRepositoryPrisma`
  (implementan los puertos de Task 2); `AcademicoCrossModuloAdapter`
  (implementa `AcademicoCrossModuloPort`, envolviendo
  `CarreraRepositoryPrisma` — mismo patrón que
  `AcreditacionCrossModuloAdapter` envuelve el repositorio de objetivos
  en `plan-estudios`). Consumido por la Task 6 (wiring).

- [ ] **Step 1: Escribir el repositorio, con las tablas re-apuntadas al schema nuevo**

```typescript
// apps/api/src/modules/academico/infrastructure/persistence/academico.repository.ts

/**
 * Repositorios Prisma de la estructura académica.
 *
 * Movido de `plan-estudios` (Fase 0b). La comprobación de unicidad usa
 * `$queryRaw` con **la misma expresión** que el índice de la migración —
 * ver el comentario de `normalizado()` para el motivo. Las tablas ahora
 * viven en el schema `academico`, no `plan_estudios` — las dos consultas
 * `$queryRaw` que las nombran explícitamente se actualizaron para eso;
 * es la única diferencia real de contenido contra el archivo original.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../platform/database/generated/client.js';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosCarreraCompleta,
  DatosFacultad,
  DatosNuevaCarrera,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../../application/ports/academico.port.js';

function normalizado(expresion: Prisma.Sql): Prisma.Sql {
  // La barra va duplicada a propósito: en un literal de plantilla `\s` se cuece
  // a `s`, y PostgreSQL recibiría `'s+'` —sustituir eses— en vez de `'\s+'`.
  return Prisma.sql`lower(translate(regexp_replace(btrim(${expresion}), '\\s+', ' ', 'g'),
                                    'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU'))`;
}

const NOMBRE_NORMALIZADO = normalizado(Prisma.raw('nombre'));

function textoNormalizado(valor: string): Prisma.Sql {
  return normalizado(Prisma.sql`${valor}`);
}

@Injectable()
export class FacultadRepositoryPrisma implements RepositorioFacultadPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: { texto?: string; activa?: boolean }): Promise<DatosFacultad[]> {
    const filas = await this.prisma.facultad.findMany({
      where: {
        ...(filtro?.texto ? { nombre: { contains: filtro.texto, mode: 'insensitive' } } : {}),
        ...(filtro?.activa === undefined ? {} : { estado: filtro.activa ? 'ACTIVO' : 'INACTIVO' }),
      },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { carreras: true } } },
    });

    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      activa: f.estado === 'ACTIVO',
      creadoEn: f.creadoEn,
      totalCarreras: f._count.carreras,
    }));
  }

  async porId(id: string): Promise<DatosFacultad | null> {
    const f = await this.prisma.facultad.findUnique({
      where: { id },
      include: { _count: { select: { carreras: true } } },
    });
    if (!f) return null;
    return {
      id: f.id,
      nombre: f.nombre,
      activa: f.estado === 'ACTIVO',
      creadoEn: f.creadoEn,
      totalCarreras: f._count.carreras,
    };
  }

  async crear(nombre: string): Promise<DatosFacultad> {
    const f = await this.prisma.facultad.create({ data: { nombre } });
    return { id: f.id, nombre: f.nombre, activa: true, creadoEn: f.creadoEn, totalCarreras: 0 };
  }

  async renombrar(id: string, nombre: string): Promise<DatosFacultad> {
    await this.prisma.facultad.update({ where: { id }, data: { nombre } });
    return (await this.porId(id))!;
  }

  async cambiarEstado(id: string, activa: boolean): Promise<DatosFacultad> {
    await this.prisma.facultad.update({
      where: { id },
      data: { estado: activa ? 'ACTIVO' : 'INACTIVO' },
    });
    return (await this.porId(id))!;
  }

  /** RF006, con la expresión del índice para que no puedan discrepar. */
  async existeNombre(nombre: string, idIgnorado?: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academico.facultades
      WHERE ${NOMBRE_NORMALIZADO} = ${textoNormalizado(nombre)}
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  /** RF005: qué se ve afectado antes de confirmar. */
  async impactoDeInactivar(id: string): Promise<{ carreras: number; planesVigentes: number }> {
    const [carreras, planesVigentes] = await Promise.all([
      this.prisma.carrera.count({ where: { facultadId: id } }),
      this.prisma.planEstudios.count({
        where: { estado: 'VIGENTE', carrera: { facultadId: id } },
      }),
    ]);
    return { carreras, planesVigentes };
  }
}

@Injectable()
export class CarreraRepositoryPrisma implements RepositorioCarreraPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: {
    facultadId?: string;
    texto?: string;
    activa?: boolean;
  }): Promise<DatosCarreraCompleta[]> {
    const filas = await this.prisma.carrera.findMany({
      where: {
        ...(filtro?.facultadId ? { facultadId: filtro.facultadId } : {}),
        ...(filtro?.activa === undefined ? {} : { estado: filtro.activa ? 'ACTIVO' : 'INACTIVO' }),
        ...(filtro?.texto
          ? {
              OR: [
                { nombre: { contains: filtro.texto, mode: 'insensitive' as const } },
                { codigo: { contains: filtro.texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: 'asc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosCarreraCompleta | null> {
    const c = await this.prisma.carrera.findUnique({ where: { id } });
    return c ? aDatos(c) : null;
  }

  async crear(datos: DatosNuevaCarrera): Promise<DatosCarreraCompleta> {
    return aDatos(await this.prisma.carrera.create({ data: datos }));
  }

  async actualizar(
    id: string,
    datos: Omit<DatosNuevaCarrera, 'facultadId'>,
  ): Promise<DatosCarreraCompleta> {
    return aDatos(await this.prisma.carrera.update({ where: { id }, data: datos }));
  }

  async cambiarEstado(id: string, activa: boolean): Promise<DatosCarreraCompleta> {
    return aDatos(
      await this.prisma.carrera.update({
        where: { id },
        data: { estado: activa ? 'ACTIVO' : 'INACTIVO' },
      }),
    );
  }

  async existeNombreEnFacultad(
    facultadId: string,
    nombre: string,
    idIgnorado?: string,
  ): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academico.carreras
      WHERE facultad_id = ${facultadId}::uuid
        AND ${NOMBRE_NORMALIZADO} = ${textoNormalizado(nombre)}
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  async existeCodigo(codigo: string, idIgnorado?: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academico.carreras
      WHERE upper(btrim(codigo)) = upper(btrim(${codigo}))
        AND (${idIgnorado ?? null}::uuid IS NULL OR id <> ${idIgnorado ?? null}::uuid)
      LIMIT 1`;
    return filas.length > 0;
  }

  async asignaturasSobreCiclo(carreraId: string, cicloMaximo: number): Promise<number> {
    return this.prisma.asignatura.count({
      where: { ciclo: { carreraId, numero: { gt: cicloMaximo } } },
    });
  }

  async sincronizarCiclos(carreraId: string, totalCiclos: number): Promise<void> {
    const existentes = await this.prisma.ciclo.findMany({
      where: { carreraId },
      select: { numero: true },
    });
    const numeros = new Set(existentes.map((c) => c.numero));

    const faltantes = Array.from({ length: totalCiclos }, (_, i) => i + 1).filter(
      (n) => !numeros.has(n),
    );

    await this.prisma.$transaction([
      ...(faltantes.length > 0
        ? [
            this.prisma.ciclo.createMany({
              data: faltantes.map((numero) => ({ carreraId, numero })),
            }),
          ]
        : []),
      this.prisma.ciclo.deleteMany({ where: { carreraId, numero: { gt: totalCiclos } } }),
    ]);
  }
}

function aDatos(c: {
  id: string;
  facultadId: string;
  nombre: string;
  codigo: string;
  duracionAnios: number;
  estado: string;
  creadoEn: Date;
}): DatosCarreraCompleta {
  return {
    id: c.id,
    facultadId: c.facultadId,
    nombre: c.nombre,
    codigo: c.codigo,
    duracionAnios: c.duracionAnios,
    activa: c.estado === 'ACTIVO',
    creadoEn: c.creadoEn,
  };
}
```

- [ ] **Step 2: Escribir el adaptador cross-módulo**

```typescript
// apps/api/src/modules/academico/infrastructure/academico-cross-modulo.adapter.ts

/**
 * Implementa `AcademicoCrossModuloPort` reutilizando `CarreraRepositoryPrisma`
 * — mismo patrón que `AcreditacionCrossModuloAdapter` en `plan-estudios`.
 */

import { Injectable } from '@nestjs/common';

import type { AcademicoCrossModuloPort, DatosCarreraResumen } from '../application/ports/academico-cross-modulo.port.js';
import { CarreraRepositoryPrisma } from './persistence/academico.repository.js';

@Injectable()
export class AcademicoCrossModuloAdapter implements AcademicoCrossModuloPort {
  constructor(private readonly carreras: CarreraRepositoryPrisma) {}

  async carreraPorId(id: string): Promise<DatosCarreraResumen | null> {
    const c = await this.carreras.porId(id);
    return c ? { id: c.id, nombre: c.nombre, codigo: c.codigo, activa: c.activa } : null;
  }

  async carrerasActivas(): Promise<DatosCarreraResumen[]> {
    const activas = await this.carreras.listar({ activa: true });
    return activas.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo, activa: c.activa }));
  }
}
```

- [ ] **Step 3: Escribir el test de integración**

Sigue el patrón real ya usado en el proyecto: conexión directa con
`new PrismaService()` a la base `sgc_test`, sin Testcontainers dinámico
(confirmado en ciclos anteriores — ver cualquier `*.int.spec.ts`
existente en `apps/api/test/integration/` para el `beforeEach`/`afterAll`
exactos, por ejemplo `plan-estudios.int.spec.ts` o el más reciente que
encuentres).

```typescript
// apps/api/test/integration/academico.int.spec.ts

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const facultades = new FacultadRepositoryPrisma(prisma);
const carreras = new CarreraRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.ciclos, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('FacultadRepositoryPrisma', () => {
  it('crea y relee, con totalCarreras en cero', async () => {
    const f = await facultades.crear('Ingeniería');
    expect(f.activa).toBe(true);
    expect(f.totalCarreras).toBe(0);

    const releida = await facultades.porId(f.id);
    expect(releida?.nombre).toBe('Ingeniería');
  });

  it('existeNombre detecta variantes normalizadas (mayúsculas, acentos, espacios)', async () => {
    await facultades.crear('Ingeniería  de Sistemas');
    expect(await facultades.existeNombre('INGENIERIA DE SISTEMAS')).toBe(true);
    expect(await facultades.existeNombre('Otra cosa')).toBe(false);
  });
});

describe('CarreraRepositoryPrisma', () => {
  it('crea con su facultad y sincroniza ciclos', async () => {
    const f = await facultades.crear('Ingeniería');
    const c = await carreras.crear({
      facultadId: f.id,
      nombre: 'Ingeniería de Sistemas',
      codigo: 'ISI',
      duracionAnios: 5,
    });
    await carreras.sincronizarCiclos(c.id, 10);

    expect(await carreras.asignaturasSobreCiclo(c.id, 10)).toBe(0);
  });

  it('existeCodigo es único en toda la universidad, no por facultad', async () => {
    const f1 = await facultades.crear('Ingeniería');
    const f2 = await facultades.crear('Ciencias de la Salud');
    await carreras.crear({ facultadId: f1.id, nombre: 'A', codigo: 'ISI', duracionAnios: 5 });

    await expect(
      carreras.crear({ facultadId: f2.id, nombre: 'B', codigo: 'ISI', duracionAnios: 5 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Correr el test de integración**

```bash
cd apps/api && SGC_DB_DESECHABLE=1 DATABASE_URL="postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public" npx vitest run --config vitest.integration.config.ts test/integration/academico.int.spec.ts
```
Expected: PASS, los 4 tests. Si falla con un error de tabla inexistente
(`relation "academico.facultades" does not exist`), la migración de la
Task 1 no se aplicó contra `sgc_test` — correr
`npx prisma migrate deploy` con el `DATABASE_URL` de `sgc_test` antes de
reintentar.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/academico/infrastructure apps/api/test/integration/academico.int.spec.ts
git commit -m "feat(academico): repositorio Prisma y adaptador cross-módulo (Fase 0b)"
```

---

### Task 4: Controllers y DTOs de `academico` — y el que se queda en `plan-estudios`

**Files:**
- Create: `apps/api/src/modules/academico/infrastructure/http/academico.controller.ts`
- Create: `apps/api/src/modules/academico/infrastructure/http/dto/academico.dto.ts`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/planes.controller.ts`
  (agrega `VersionesDeCarreraController`)
- Delete: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-estructura.use-case.ts`
- Delete: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-estructura.spec.ts`
- Delete: `apps/api/src/modules/plan-estudios/application/ports/estructura.port.ts`
- Delete: `apps/api/src/modules/plan-estudios/infrastructure/persistence/estructura.repository.ts`
- Delete: `apps/api/src/modules/plan-estudios/infrastructure/http/estructura.controller.ts`
- Delete: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/estructura.dto.ts`
- Delete: `apps/api/src/modules/plan-estudios/domain/events/eventos-estructura.ts`

**Interfaces:**
- Consumes: `GestionarFacultades`, `GestionarCarreras` (Task 2);
  `GestionarPlanes.versionesDe` (ya existe en `plan-estudios`, sin
  cambios).
- Produces: `FacultadesController`, `CarrerasController` (nuevos, en
  `academico`, mismas rutas HTTP que antes salvo
  `GET /carreras/:id/versiones`); `VersionesDeCarreraController` (nuevo,
  en `plan-estudios`, esa única ruta). Consumido por la Task 6 (wiring).

Esta es la tarea que borra el código viejo — se hace al final, en el
mismo commit que agrega los controllers nuevos, para que el proyecto no
quede sin esas rutas registradas en ningún punto intermedio.

- [ ] **Step 1: Crear el DTO**

Copiar el contenido completo de
`apps/api/src/modules/plan-estudios/infrastructure/http/dto/estructura.dto.ts`
a `apps/api/src/modules/academico/infrastructure/http/dto/academico.dto.ts`,
sin cambios (no importa nada de otro módulo, solo `class-validator` y el
decorador compartido `Recortado` — su import
`from '../../../../../platform/http/recortado.js'` necesita **un nivel
menos** de `../` porque `academico/infrastructure/http/dto/` está a la
misma profundidad que `plan-estudios/infrastructure/http/dto/` bajo
`modules/` — es decir, la ruta relativa se mantiene idéntica, ambos
módulos cuelgan de `modules/` al mismo nivel).

- [ ] **Step 2: Crear los controllers, con `versiones()` fuera**

```typescript
// apps/api/src/modules/academico/infrastructure/http/academico.controller.ts

/**
 * Controllers de la estructura académica.
 *
 * Movidos de `plan-estudios` (Fase 0b). `CarrerasController` YA NO tiene
 * `GET :id/versiones` — esa ruta depende de `GestionarPlanes`, de
 * `plan-estudios`, y moverla aquí habría invertido el sentido de la
 * dependencia entre los dos módulos (`academico` nunca importa de
 * `plan-estudios`, CLAUDE.md §3.1). Se quedó en `plan-estudios`, en
 * `VersionesDeCarreraController` (`planes.controller.ts`), con el mismo
 * prefijo de ruta `/carreras` — dos controllers en módulos distintos
 * pueden compartir prefijo sin chocar, mientras no registren la misma
 * combinación de método+ruta, y no la registran.
 */

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarFacultades } from '../../application/use-cases/gestionar-facultades.use-case.js';
import { GestionarCarreras } from '../../application/use-cases/gestionar-carreras.use-case.js';
import {
  CambiarEstadoDto,
  CrearFacultadDto,
  DatosCarreraDto,
  FiltroDto,
} from './dto/academico.dto.js';

@ApiTags('Facultades')
@ApiBearerAuth()
@Controller('facultades')
export class FacultadesController {
  constructor(
    private readonly facultades: GestionarFacultades,
    private readonly carreras: GestionarCarreras,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar facultades',
    description: 'RF003 y RF007. Ordenadas alfabéticamente; admite búsqueda y filtro de estado.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroDto) {
    return this.facultades.listar(actor, filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una facultad' })
  @ApiResponse({ status: 409, description: 'Ya existe una facultad con ese nombre.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearFacultadDto) {
    return this.facultades.crear(actor, dto.nombre);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar una facultad' })
  async renombrar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CrearFacultadDto,
  ) {
    return this.facultades.renombrar(actor, id, dto.nombre);
  }

  @Get(':id/impacto-inactivacion')
  @ApiOperation({
    summary: 'Consultar qué se ve afectado al inactivar',
    description:
      'RF005. La confirmación debe decir cuántas carreras y planes vigentes ' +
      'dependen de la facultad, no pedir un sí a ciegas.',
  })
  async impacto(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.facultades.impactoDeInactivar(actor, id);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o inactivar una facultad',
    description: 'RF005. No elimina nada: las carreras y planes siguen consultables.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.facultades.cambiarEstado(actor, id, dto.activa);
  }

  @Get(':id/carreras')
  @ApiOperation({ summary: 'Carreras de una facultad (RF004)' })
  async carrerasDe(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Query() filtro: FiltroDto,
  ) {
    return this.carreras.listar(actor, { facultadId: id, ...filtro });
  }

  @Post(':id/carreras')
  @ApiOperation({
    summary: 'Registrar una carrera en esta facultad',
    description:
      'RF009 y RF011. Crea también sus ciclos: dos por año, según la convención ' + 'de RF011 RN2.',
  })
  @ApiResponse({ status: 409, description: 'Nombre repetido en la facultad, o código ya usado.' })
  async crearCarrera(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCarreraDto,
  ) {
    return this.carreras.crear(actor, id, dto);
  }
}

@ApiTags('Carreras')
@ApiBearerAuth()
@Controller('carreras')
export class CarrerasController {
  constructor(private readonly carreras: GestionarCarreras) {}

  @Get()
  @ApiOperation({ summary: 'Listar carreras (RF013, RF016)' })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroDto) {
    return this.carreras.listar(actor, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una carrera' })
  @ApiResponse({ status: 404, description: 'La carrera no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.carreras.porId(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una carrera',
    description:
      'RF012. Rechaza reducir los ciclos si hay asignaturas ubicadas en los que ' +
      'dejarían de existir.',
  })
  @ApiResponse({
    status: 409,
    description: 'Nombre o código repetido, o reducción de ciclos inviable.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosCarreraDto,
  ) {
    return this.carreras.editar(actor, id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o inactivar una carrera (RF018)' })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.carreras.cambiarEstado(actor, id, dto.activa);
  }
}
```

Nota: `GestionarFacultades` y `GestionarCarreras` vienen de dos archivos
distintos (`gestionar-facultades.use-case.ts`/`gestionar-carreras.use-case.ts`,
Task 2) — confirma que el archivo final tiene los dos imports por
separado, tal como están escritos arriba, y no uno solo apuntando al
archivo viejo `gestionar-estructura.use-case.ts` (que ya no existe desde
la Task 2).

- [ ] **Step 3: Agregar `VersionesDeCarreraController` a `plan-estudios`**

En `apps/api/src/modules/plan-estudios/infrastructure/http/planes.controller.ts`,
`GestionarPlanes` ya está importado e inyectado en `PlanesController`. Al
final del archivo (después del cierre de la clase `PlanesController`),
agregar:

```typescript
@ApiTags('Carreras')
@ApiBearerAuth()
@Controller('carreras')
export class VersionesDeCarreraController {
  constructor(private readonly planes: GestionarPlanes) {}

  @Get(':id/versiones')
  @ApiOperation({
    summary: 'Histórico de versiones del plan de esta carrera',
    description:
      'RF076 y RF091. De la versión más alta a la más baja, que es el orden en ' +
      'que se lee un histórico. Incluye las que ya quedaron como Histórico.',
  })
  async versiones(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.planes.versionesDe(actor, id);
  }
}
```

- [ ] **Step 4: Borrar los 7 archivos viejos**

```bash
git rm apps/api/src/modules/plan-estudios/application/use-cases/gestionar-estructura.use-case.ts
git rm apps/api/src/modules/plan-estudios/application/use-cases/gestionar-estructura.spec.ts
git rm apps/api/src/modules/plan-estudios/application/ports/estructura.port.ts
git rm apps/api/src/modules/plan-estudios/infrastructure/persistence/estructura.repository.ts
git rm apps/api/src/modules/plan-estudios/infrastructure/http/estructura.controller.ts
git rm apps/api/src/modules/plan-estudios/infrastructure/http/dto/estructura.dto.ts
git rm apps/api/src/modules/plan-estudios/domain/events/eventos-estructura.ts
```

Esto va a dejar el proyecto sin compilar hasta la Task 6 (wiring en
`app.module.ts`, que todavía importa de estos 7 archivos) — es esperado
en este punto del plan, `tsc` lo confirma en el Step 5 y vuelve a estar
limpio recién al final de la Task 6.

- [ ] **Step 5: Confirmar los errores esperados**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: FAIL, con errores únicamente en `apps/api/src/app.module.ts`
(imports que apuntan a los 7 archivos borrados). Si aparece un error en
cualquier OTRO archivo, detente — significa que algo más en el proyecto
dependía de los archivos viejos y no lo capturamos en el escaneo previo;
anótalo en tu informe en vez de arreglarlo a ciegas.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/academico/infrastructure/http apps/api/src/modules/plan-estudios/infrastructure/http/planes.controller.ts
git add -u apps/api/src/modules/plan-estudios
git commit -m "feat(academico): controllers propios; versiones() se queda en plan-estudios (Fase 0b)"
```

---

### Task 5: Tests de guardia (aislamiento)

**Files:**
- Create: `apps/api/src/modules/academico/aislamiento.spec.ts`
- Modify: `apps/api/src/modules/plan-estudios/aislamiento.spec.ts`

**Interfaces:**
- Consumes: nada de código de producción — estos tests leen el árbol de
  archivos del proyecto directamente.

`apps/api/src/modules/plan-estudios/aislamiento.spec.ts` hoy solo vigila
`plan-estudios → mejora-continua` (un único `describe`). Este plan agrega
un segundo `describe` al mismo archivo para `plan-estudios → academico` —
mismo patrón que ya usa `mejora-continua/aislamiento.spec.ts`, que tiene
varios `describe`, uno por dirección vigilada.

- [ ] **Step 1: Escribir el test que falla, en `academico/aislamiento.spec.ts`**

```typescript
// apps/api/src/modules/academico/aislamiento.spec.ts

/**
 * `academico` nunca importa de `plan-estudios` — la dependencia va en un
 * solo sentido (CLAUDE.md §3.1). Mismo mecanismo que las guardias
 * hermanas: se escribe sobre el especificador ya extraído y lleva su
 * propio control positivo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

const DE_PLAN_ESTUDIOS = /(^|\/)plan-estudios\//;

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relativo(ruta: string): string {
  return ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
}

function importadosDe(contenido: string): string[] {
  return [...contenido.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
}

function importsDe(raiz: string = RAIZ): { archivo: string; importado: string }[] {
  return archivosTs(raiz).flatMap((archivo) =>
    importadosDe(readFileSync(archivo, 'utf8')).map((importado) => ({
      archivo: relativo(archivo),
      importado,
    })),
  );
}

describe('aislamiento de academico hacia plan-estudios', () => {
  it('no importa nada de plan-estudios', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_PLAN_ESTUDIOS.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido escrito en relativo', () => {
    expect(
      DE_PLAN_ESTUDIOS.test('../../plan-estudios/infrastructure/persistence/plan.repository.js'),
    ).toBe(true);
    expect(DE_PLAN_ESTUDIOS.test('./plan-estudios-legacy.js')).toBe(false);
  });
});
```

Y agregar, al final de
`apps/api/src/modules/plan-estudios/aislamiento.spec.ts` (dentro del
mismo `describe('aislamiento de plan-estudios hacia mejora-continua')`
existente **no** — crear un `describe` nuevo separado, porque el
`PUERTO_PERMITIDO`/`DE_MEJORA_CONTINUA` de ese bloque son específicos de
esa dirección):

```typescript
describe('aislamiento de plan-estudios hacia academico', () => {
  const DE_ACADEMICO = /(^|\/)academico\//;
  const PUERTO_PERMITIDO_ACADEMICO = 'ports/academico-cross-modulo.port.js';

  it('solo importa de academico el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_ACADEMICO.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_ACADEMICO))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de academico escrito en relativo', () => {
    expect(
      DE_ACADEMICO.test('../../academico/infrastructure/persistence/academico.repository.js'),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/academico/aislamiento.spec.ts src/modules/plan-estudios/aislamiento.spec.ts`

Expected: PASS directo, los 4 tests (2 por archivo). La Task 2 (Step 1)
ya dejó una copia local de `limpiarNombre` dentro de `academico/domain/`
en vez de importarla de `plan-estudios` — este test confirma esa
decisión, no debería fallar. Si falla, es porque algún archivo de
`academico` quedó importando `limpiarNombre` (o cualquier otra cosa)
directo de `plan-estudios` en vez de usar la copia local — corrígelo
ahí, no relajes esta regla.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/academico/aislamiento.spec.ts apps/api/src/modules/plan-estudios/aislamiento.spec.ts
git commit -m "test(academico): guardia de aislamiento en ambas direcciones (Fase 0b)"
```

---

### Task 6: Wiring en `app.module.ts` y verificación completa

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 1-5.
- Produces: el módulo `academico` queda inyectable; `plan-estudios`
  consume `AcademicoCrossModuloPort` donde antes tenía su propio
  `GestionarCarreras`/`GestionarFacultades`.

- [ ] **Step 1: Actualizar los imports**

En `apps/api/src/app.module.ts`, el bloque de imports (líneas ~203-258
hoy) tiene:

```typescript
import {
  REPOSITORIO_CARRERA,
  REPOSITORIO_FACULTAD,
  type RepositorioCarreraPort,
  type RepositorioFacultadPort,
} from './modules/plan-estudios/application/ports/estructura.port.js';
```
```typescript
import {
  GestionarCarreras,
  GestionarFacultades,
} from './modules/plan-estudios/application/use-cases/gestionar-estructura.use-case.js';
```
```typescript
import {
  CarrerasController,
  FacultadesController,
} from './modules/plan-estudios/infrastructure/http/estructura.controller.js';
```
```typescript
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from './modules/plan-estudios/infrastructure/persistence/estructura.repository.js';
```

Reemplazar los 4 bloques por:

```typescript
import {
  REPOSITORIO_CARRERA,
  REPOSITORIO_FACULTAD,
  type RepositorioCarreraPort,
  type RepositorioFacultadPort,
} from './modules/academico/application/ports/academico.port.js';
import {
  ACADEMICO_CROSS_MODULO,
  type AcademicoCrossModuloPort,
} from './modules/academico/application/ports/academico-cross-modulo.port.js';
import { GestionarFacultades } from './modules/academico/application/use-cases/gestionar-facultades.use-case.js';
import { GestionarCarreras } from './modules/academico/application/use-cases/gestionar-carreras.use-case.js';
import {
  CarrerasController,
  FacultadesController,
} from './modules/academico/infrastructure/http/academico.controller.js';
import { VersionesDeCarreraController } from './modules/plan-estudios/infrastructure/http/planes.controller.js';
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from './modules/academico/infrastructure/persistence/academico.repository.js';
import { AcademicoCrossModuloAdapter } from './modules/academico/infrastructure/academico-cross-modulo.adapter.js';
```

(`VersionesDeCarreraController` se importa junto a `PlanesController`,
que ya se importa desde ese mismo archivo — revisa que no quede un import
duplicado del mismo módulo, únelos en un solo `import { ... } from
'./modules/plan-estudios/infrastructure/http/planes.controller.js'` si
`PlanesController` ya tiene su propio import ahí.)

- [ ] **Step 2: Actualizar el array `controllers`**

Agregar `VersionesDeCarreraController` al array `controllers: [...]`
(línea ~330), junto a `FacultadesController`/`CarrerasController` — el
orden dentro del array no afecta el ruteo de NestJS.

- [ ] **Step 3: Actualizar los providers**

Los dos providers existentes (línea ~384-385):

```typescript
    { provide: REPOSITORIO_FACULTAD, useClass: FacultadRepositoryPrisma },
    { provide: REPOSITORIO_CARRERA, useClass: CarreraRepositoryPrisma },
```

se quedan igual (mismos símbolos, misma forma — solo cambió de dónde se
importan las clases, ya resuelto en el Step 1). Agregar uno nuevo justo
después:

```typescript
    { provide: ACADEMICO_CROSS_MODULO, useClass: AcademicoCrossModuloAdapter },
```

- [ ] **Step 4: Actualizar las factories de `GestionarFacultades`/`GestionarCarreras`**

Las dos factories existentes (línea ~448-466) se quedan **exactamente
igual** — el cambio de import del Step 1 ya las apunta a las clases
nuevas, la forma de la factory (símbolos inyectados, orden de
parámetros) no cambió porque `GestionarFacultades`/`GestionarCarreras`
mantienen el mismo constructor que tenían en `plan-estudios`.

- [ ] **Step 5: Typecheck de todo el proyecto**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: limpio. Si queda algún error fuera de `app.module.ts`, es una
referencia a los archivos borrados en la Task 4 que no se detectó en el
escaneo previo de este plan — documéntalo en tu informe con la ruta
exacta antes de corregirlo.

- [ ] **Step 6: Suite completa del backend**

```bash
cd apps/api && npx vitest run
```
Expected: todo en verde. El número total de tests debería mantenerse
igual o subir levemente (los tests movidos de `gestionar-estructura.spec.ts`
se dividieron en dos archivos con el mismo total de casos, más los 6
tests nuevos de aislamiento de la Task 5, más los 4 de integración de la
Task 3 que corren aparte).

- [ ] **Step 7: Suite de integración completa**

```bash
cd apps/api && SGC_DB_DESECHABLE=1 DATABASE_URL="postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public" npx vitest run --config vitest.integration.config.ts test/integration/
```
Expected: todo en verde, incluido `academico.int.spec.ts` (Task 3) y
cualquier test de integración existente de `plan-estudios` que dependa
de crear una carrera (confirmar que ninguno construye directamente
`FacultadRepositoryPrisma`/`CarreraRepositoryPrisma` desde la ruta vieja
de `plan-estudios` — si alguno lo hace, es un import que quedó
desactualizado y hay que corregirlo, no un fallo a ignorar).

- [ ] **Step 8: Levantar la app real y confirmar que arranca**

```bash
cd apps/api && npm run build && node dist/main.js
```
Expected: arranca sin errores, con las rutas `/facultades`, `/carreras`
y `/carreras/:id/versiones` registradas en el log de arranque (Nest
imprime cada `RouterExplorer` mapeado). Detener el proceso después de
confirmar.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(academico): wiring de DI, módulo académico queda inyectable (Fase 0b)"
```

---

## Al terminar

Facultad, Carrera y Ciclo viven en su propio módulo, con el mismo
aislamiento por puerto que ya protege a `plan-estudios`/`mejora-continua`
entre sí, y sin perder ninguna FK real. La única desviación real del
"molde limpio" original — `GET /carreras/:id/versiones` quedándose en
`plan-estudios` — está documentada en el propio código
(`academico.controller.ts`) y en este plan, no es una sorpresa que un
lector futuro tenga que redescubrir.

Al cerrar este plan, seguir con el siguiente de la Fase 0
(`objetivos-educacionales`), en la misma rama `dashboard-fase0-fundacion`
si es donde se está ejecutando toda la Fase 0, o invocar
`superpowers:finishing-a-development-branch` si este plan se ejecutó
solo.
