# Vista de inicio del Administrador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `VistaAdminInicio` stub with the "Estructura institucional" home screen for `ADMIN_SISTEMA`: four KPIs, faculties list, recommended action, structure pendings, recent additions and a link to Reportes, fed by a new `GET /estructura-institucional` endpoint.

**Architecture:** A pure domain function in `academico` (`calcularEstructuraInstitucional`) derives everything (codes, progress, status, KPIs, lists). A use case in `academico` checks `usuario.gestionar`, reads faculties/careers through its own repositories, asks `auth` for user counts through a new poor port (`ConteoDeUsuariosPort`) and delegates to the domain function. The frontend is one `useQuery` feeding the Fase 0e components already in `@/shared/components/ui`, plus one view-specific component (`AccionRecomendada`).

**Tech Stack:** NestJS + Prisma + Vitest (API — note: Vitest, not Jest), React 18 + TypeScript, `@tanstack/react-query`, Vitest + Testing Library (web), Playwright + `@axe-core/playwright` (e2e), Tailwind with existing tokens only.

**Spec:** `docs/superpowers/specs/2026-09-23-dashboard-vista-admin-design.md`

## Global Constraints

- TypeScript `strict`; no `any` without a justifying comment (CLAUDE.md §2).
- `academico/domain/` imports nothing from NestJS, Prisma, or other modules. `academico/application/` may import from `auth` **only** files under `auth/application/ports/`.
- `academico` never imports from `plan-estudios` (existing guard stays green).
- The new port is "poor": numbers only, never user data (same mould as `DirectorioDeUsuariosPort`).
- Endpoint permission is `usuario.gestionar`, checked inside the use case via `AuthorizationPort.puede(actor.id, 'usuario.gestionar', null)`. Controllers carry no permission logic (the repo has no permission decorators).
- Only users with `estado = ACTIVO` are counted.
- Colors: only tokens that already exist in `apps/web/src/styles/global.css` (`uc-primary`, `uc-v1`, `uc-dark`, `superficie`, `superficie-tenue`, `tinta`, `tinta-suave`, …). No new ones.
- No `codigo` column on `Facultad`; faculty code and progress are derived.
- The "Aprobar alta … solicitada hace 1 semana" mockup item is NOT built (spec §2.2).
- Code identifiers and comments follow the existing Spanish domain naming and comment style; commit messages are conventional commits in Spanish like the recent history. **No AI attribution / Co-Authored-By trailers** (user's global rule).
- API tests: `cd apps/api && npx vitest run <file>`. Integration tests: `cd apps/api && npm run test:integration -- <file>` (needs the disposable DB configured as for `test/integration/academico.int.spec.ts`, with roles seeded via `npm run db:seed`). Web tests: `cd apps/web && npx vitest run <file>`.

## Interpretations of the spec (decided here, flag in review)

- **Inactive faculties** still appear in `facultades` (status `INACTIVA`, sorted with the rest) with their own counts computed normally, but they are excluded from every KPI, from `carrerasSinDirector`, `facultadesSinCarreras` and `altasRecientes`.
- **Altas recientes** = active faculties + active careers *of active faculties*.
- Faculty "context" in an alta: `'Sin carreras aún'` when it has 0 active careers, else `"N carrera(s)"`.
- The mockup's second line on each pending ("Carrera sin responsable") is folded into the single `texto` because `ItemPendiente` has only one text field and Fase 0e components are not being changed.

## Review Focus

- `kpis.carrerasSinDirector` must be *exactly* `carrerasSinDirector.length`, and `kpis.carreras` exactly the sum of `carreras` over active faculties (spec §3.3). A test asserts both on the same fixture.
- An inactive career (or a career of an inactive faculty) must never leak into any count, list or alta.
- The use case must deny **before** touching `auth` (no port call on denial).
- The isolation guard needs its own positive control: a regex that stops matching would turn the rule into `[]` vs `[]`.
- `ResumenPage.test.tsx` currently asserts the stub's text and has no `QueryClientProvider`; it must be updated in the same task that removes the stub.

---

### Task 1: Domain function `calcularEstructuraInstitucional`

**Files:**
- Create: `apps/api/src/modules/academico/domain/services/estructura-institucional.ts`
- Test: `apps/api/src/modules/academico/domain/services/estructura-institucional.spec.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (used by Task 3 and mirrored by Task 5): `FacultadEntrada`, `CarreraEntrada`, `ConteoDeCarrera`, `EstructuraInstitucional`, `codigoDeFacultad(nombre)`, `calcularEstructuraInstitucional(entrada)`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/academico/domain/services/estructura-institucional.spec.ts
import { describe, expect, it } from 'vitest';

import {
  calcularEstructuraInstitucional,
  codigoDeFacultad,
  type CarreraEntrada,
  type ConteoDeCarrera,
  type FacultadEntrada,
} from './estructura-institucional.js';

const dia = (n: number) => new Date(`2026-09-${String(n).padStart(2, '0')}T00:00:00Z`);

function facultad(sobre: Partial<FacultadEntrada> & { id: string }): FacultadEntrada {
  return { nombre: `Facultad de ${sobre.id}`, activa: true, creadoEn: dia(1), ...sobre };
}

function carrera(sobre: Partial<CarreraEntrada> & { id: string; facultadId: string }): CarreraEntrada {
  return { nombre: `Carrera ${sobre.id}`, activa: true, creadoEn: dia(1), ...sobre };
}

function conteos(pares: Record<string, ConteoDeCarrera>): Map<string, ConteoDeCarrera> {
  return new Map(Object.entries(pares));
}

describe('codigoDeFacultad', () => {
  it.each([
    ['Facultad de Ingeniería', 'ING'],
    ['Facultad de Ciencias de la Empresa', 'EMP'],
    ['Facultad de Ciencias de la Salud', 'SAL'],
    ['Facultad de Humanidades', 'HUM'],
    ['Facultad de Derecho', 'DER'],
    ['Facultad de Educación', 'EDU'],
    ['Facultad Ñandú', 'NAN'],
    ['Facultad de TI', 'TI'],
  ])('%s → %s', (nombre, esperado) => {
    expect(codigoDeFacultad(nombre)).toBe(esperado);
  });
});

describe('calcularEstructuraInstitucional', () => {
  const base = {
    facultades: [
      facultad({ id: 'ing', nombre: 'Facultad de Ingeniería' }),
      facultad({ id: 'der', nombre: 'Facultad de Derecho' }),
    ],
    carreras: [
      carrera({ id: 'c-sis', facultadId: 'ing', nombre: 'Ing. de Sistemas' }),
      carrera({ id: 'c-civ', facultadId: 'ing', nombre: 'Ing. Civil' }),
      carrera({ id: 'c-der', facultadId: 'der', nombre: 'Derecho' }),
    ],
    conteos: conteos({
      'c-sis': { usuarios: 3, directores: 1 },
      'c-civ': { usuarios: 1, directores: 0 },
      'c-der': { usuarios: 2, directores: 1 },
    }),
    usuariosConAcceso: 9,
  };

  it('deriva código, conteos, progreso y estado por facultad, ordenadas por nombre', () => {
    const { facultades } = calcularEstructuraInstitucional(base);

    expect(facultades.map((f) => f.nombre)).toEqual([
      'Facultad de Derecho',
      'Facultad de Ingeniería',
    ]);
    expect(facultades[0]).toMatchObject({
      codigo: 'DER',
      carreras: 1,
      usuarios: 2,
      carrerasSinDirector: 0,
      progreso: 100,
      estado: 'ACTIVA',
    });
    expect(facultades[1]).toMatchObject({
      codigo: 'ING',
      carreras: 2,
      usuarios: 4,
      carrerasSinDirector: 1,
      progreso: 50,
      estado: 'REVISAR',
    });
  });

  it('el KPI de carreras sin director es la longitud de la lista, y el de carreras la suma', () => {
    const r = calcularEstructuraInstitucional(base);

    expect(r.kpis.carrerasSinDirector).toBe(r.carrerasSinDirector.length);
    expect(r.kpis.carreras).toBe(
      r.facultades.filter((f) => f.activa).reduce((suma, f) => suma + f.carreras, 0),
    );
    expect(r.kpis).toMatchObject({ facultadesActivas: 2, carreras: 3, usuariosConAcceso: 9 });
    expect(r.carrerasSinDirector).toEqual([
      { id: 'c-civ', nombre: 'Ing. Civil', facultad: 'Facultad de Ingeniería' },
    ]);
  });

  it('una carrera inactiva no cuenta en nada', () => {
    const r = calcularEstructuraInstitucional({
      ...base,
      carreras: [...base.carreras, carrera({ id: 'c-vieja', facultadId: 'ing', activa: false })],
      conteos: conteos({ ...Object.fromEntries(base.conteos), 'c-vieja': { usuarios: 5, directores: 0 } }),
    });

    const ing = r.facultades.find((f) => f.id === 'ing');
    expect(ing).toMatchObject({ carreras: 2, usuarios: 4, carrerasSinDirector: 1, progreso: 50 });
    expect(r.carrerasSinDirector.map((c) => c.id)).toEqual(['c-civ']);
    expect(r.altasRecientes.map((a) => a.id)).not.toContain('c-vieja');
  });

  it('una facultad sin carreras activas es REVISAR con progreso 0 y sale en facultadesSinCarreras', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [facultad({ id: 'sal', nombre: 'Facultad de Ciencias de la Salud' })],
      carreras: [],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.facultades[0]).toMatchObject({ estado: 'REVISAR', progreso: 0, carreras: 0 });
    expect(r.facultadesSinCarreras).toEqual([
      { id: 'sal', nombre: 'Facultad de Ciencias de la Salud' },
    ]);
    expect(r.altasRecientes[0]).toMatchObject({
      tipo: 'FACULTAD',
      contexto: 'Sin carreras aún',
    });
  });

  it('una facultad inactiva es INACTIVA y queda fuera de KPIs, listas y altas', () => {
    const r = calcularEstructuraInstitucional({
      ...base,
      facultades: [
        ...base.facultades,
        facultad({ id: 'hum', nombre: 'Facultad de Humanidades', activa: false, creadoEn: dia(20) }),
      ],
      carreras: [
        ...base.carreras,
        carrera({ id: 'c-hum', facultadId: 'hum', nombre: 'Filosofía', creadoEn: dia(21) }),
      ],
      conteos: conteos({ ...Object.fromEntries(base.conteos), 'c-hum': { usuarios: 1, directores: 0 } }),
    });

    expect(r.facultades.find((f) => f.id === 'hum')).toMatchObject({
      estado: 'INACTIVA',
      activa: false,
    });
    expect(r.kpis).toMatchObject({ facultadesActivas: 2, carreras: 3, carrerasSinDirector: 1 });
    expect(r.carrerasSinDirector.map((c) => c.id)).not.toContain('c-hum');
    expect(r.facultadesSinCarreras.map((f) => f.id)).not.toContain('hum');
    expect(r.altasRecientes.map((a) => a.id)).not.toContain('hum');
    expect(r.altasRecientes.map((a) => a.id)).not.toContain('c-hum');
  });

  it('una carrera sin entrada en el mapa de conteos cuenta como sin director', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [facultad({ id: 'ing', nombre: 'Facultad de Ingeniería' })],
      carreras: [carrera({ id: 'c-x', facultadId: 'ing' })],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.kpis.carrerasSinDirector).toBe(1);
  });

  it('las altas recientes mezclan facultades y carreras, tope de 4, más nueva primero, empate por nombre', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [
        facultad({ id: 'f1', nombre: 'Facultad de Arte', creadoEn: dia(10) }),
        facultad({ id: 'f2', nombre: 'Facultad de Bio', creadoEn: dia(2) }),
      ],
      carreras: [
        carrera({ id: 'c1', facultadId: 'f1', nombre: 'Zoología', creadoEn: dia(12) }),
        carrera({ id: 'c2', facultadId: 'f1', nombre: 'Astronomía', creadoEn: dia(12) }),
        carrera({ id: 'c3', facultadId: 'f2', nombre: 'Botánica', creadoEn: dia(5) }),
        carrera({ id: 'c4', facultadId: 'f2', nombre: 'Ecología', creadoEn: dia(1) }),
      ],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.altasRecientes.map((a) => a.id)).toEqual(['c2', 'c1', 'f1', 'c3']);
    expect(r.altasRecientes[0]).toMatchObject({
      tipo: 'CARRERA',
      contexto: 'Facultad de Arte',
      creadoEn: '2026-09-12T00:00:00.000Z',
    });
    expect(r.altasRecientes[2]).toMatchObject({ tipo: 'FACULTAD', contexto: '2 carreras' });
  });

  it('carrerasSinDirector se ordena por facultad y luego por nombre', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [
        facultad({ id: 'b', nombre: 'Facultad de Bio' }),
        facultad({ id: 'a', nombre: 'Facultad de Arte' }),
      ],
      carreras: [
        carrera({ id: 'c1', facultadId: 'b', nombre: 'Zeta' }),
        carrera({ id: 'c2', facultadId: 'a', nombre: 'Beta' }),
        carrera({ id: 'c3', facultadId: 'a', nombre: 'Alfa' }),
      ],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.carrerasSinDirector.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/modules/academico/domain/services/estructura-institucional.spec.ts`
Expected: FAIL — cannot resolve `./estructura-institucional.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/api/src/modules/academico/domain/services/estructura-institucional.ts
/**
 * Lo que la vista de inicio del Administrador necesita saber de la estructura
 * institucional, derivado en un solo sitio.
 *
 * Dominio puro: recibe listas y conteos ya leídos y devuelve el resumen. No
 * conoce a `auth` —el conteo entra como un mapa— ni a Prisma ni a NestJS.
 *
 * Las carreras inactivas no cuentan para nada: una carrera apagada sin
 * director no es una tarea pendiente. Las facultades inactivas aparecen en la
 * lista, con su estado, pero quedan fuera de los KPI y de las listas de
 * pendientes por la misma razón.
 */

export interface FacultadEntrada {
  readonly id: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

export interface CarreraEntrada {
  readonly id: string;
  readonly facultadId: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

/** Misma forma que el puerto de `auth`, declarada aquí para que el dominio no importe nada. */
export interface ConteoDeCarrera {
  readonly usuarios: number;
  readonly directores: number;
}

export type EstadoFacultad = 'ACTIVA' | 'REVISAR' | 'INACTIVA';

export interface FilaFacultad {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly activa: boolean;
  readonly carreras: number;
  readonly usuarios: number;
  readonly carrerasSinDirector: number;
  readonly progreso: number;
  readonly estado: EstadoFacultad;
}

export interface AltaReciente {
  readonly tipo: 'CARRERA' | 'FACULTAD';
  readonly id: string;
  readonly nombre: string;
  readonly contexto: string;
  readonly creadoEn: string;
}

export interface EstructuraInstitucional {
  readonly kpis: {
    readonly facultadesActivas: number;
    readonly carreras: number;
    readonly usuariosConAcceso: number;
    readonly carrerasSinDirector: number;
  };
  readonly facultades: readonly FilaFacultad[];
  readonly carrerasSinDirector: readonly { id: string; nombre: string; facultad: string }[];
  readonly facultadesSinCarreras: readonly { id: string; nombre: string }[];
  readonly altasRecientes: readonly AltaReciente[];
}

export interface EntradaEstructura {
  readonly facultades: readonly FacultadEntrada[];
  readonly carreras: readonly CarreraEntrada[];
  readonly conteos: ReadonlyMap<string, ConteoDeCarrera>;
  readonly usuariosConAcceso: number;
}

const ALTAS_MAXIMAS = 4;

/** Tres primeras letras de la última palabra, en mayúsculas y sin acentos. */
export function codigoDeFacultad(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/);
  const ultima = palabras[palabras.length - 1] ?? '';
  return ultima
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3);
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
  a.nombre.localeCompare(b.nombre, 'es');

function carrerasTexto(n: number): string {
  return n === 1 ? '1 carrera' : `${n} carreras`;
}

export function calcularEstructuraInstitucional(entrada: EntradaEstructura): EstructuraInstitucional {
  const sinConteo: ConteoDeCarrera = { usuarios: 0, directores: 0 };
  const conteoDe = (id: string) => entrada.conteos.get(id) ?? sinConteo;

  const activasPorFacultad = new Map<string, CarreraEntrada[]>();
  for (const c of entrada.carreras) {
    if (!c.activa) continue;
    const lista = activasPorFacultad.get(c.facultadId) ?? [];
    lista.push(c);
    activasPorFacultad.set(c.facultadId, lista);
  }
  const activasDe = (facultadId: string) =>
    [...(activasPorFacultad.get(facultadId) ?? [])].sort(porNombre);
  const sinDirector = (c: CarreraEntrada) => conteoDe(c.id).directores === 0;

  const ordenadas = [...entrada.facultades].sort(porNombre);

  const facultades: FilaFacultad[] = ordenadas.map((f) => {
    const carreras = activasDe(f.id);
    const faltantes = carreras.filter(sinDirector).length;
    const conDirector = carreras.length - faltantes;
    const estado: EstadoFacultad = !f.activa
      ? 'INACTIVA'
      : carreras.length === 0 || faltantes > 0
        ? 'REVISAR'
        : 'ACTIVA';

    return {
      id: f.id,
      nombre: f.nombre,
      codigo: codigoDeFacultad(f.nombre),
      activa: f.activa,
      carreras: carreras.length,
      usuarios: carreras.reduce((suma, c) => suma + conteoDe(c.id).usuarios, 0),
      carrerasSinDirector: faltantes,
      progreso: carreras.length === 0 ? 0 : Math.round((conDirector / carreras.length) * 100),
      estado,
    };
  });

  const activas = ordenadas.filter((f) => f.activa);

  const carrerasSinDirector = activas.flatMap((f) =>
    activasDe(f.id)
      .filter(sinDirector)
      .map((c) => ({ id: c.id, nombre: c.nombre, facultad: f.nombre })),
  );

  const facultadesSinCarreras = activas
    .filter((f) => activasDe(f.id).length === 0)
    .map((f) => ({ id: f.id, nombre: f.nombre }));

  const candidatas: (AltaReciente & { readonly instante: number })[] = [
    ...activas.map((f) => {
      const n = activasDe(f.id).length;
      return {
        tipo: 'FACULTAD' as const,
        id: f.id,
        nombre: f.nombre,
        contexto: n === 0 ? 'Sin carreras aún' : carrerasTexto(n),
        creadoEn: f.creadoEn.toISOString(),
        instante: f.creadoEn.getTime(),
      };
    }),
    ...activas.flatMap((f) =>
      activasDe(f.id).map((c) => ({
        tipo: 'CARRERA' as const,
        id: c.id,
        nombre: c.nombre,
        contexto: f.nombre,
        creadoEn: c.creadoEn.toISOString(),
        instante: c.creadoEn.getTime(),
      })),
    ),
  ];

  const altasRecientes: AltaReciente[] = candidatas
    .sort((a, b) => b.instante - a.instante || porNombre(a, b))
    .slice(0, ALTAS_MAXIMAS)
    .map(({ instante: _instante, ...alta }) => alta);

  return {
    kpis: {
      facultadesActivas: activas.length,
      carreras: facultades.filter((f) => f.activa).reduce((suma, f) => suma + f.carreras, 0),
      usuariosConAcceso: entrada.usuariosConAcceso,
      carrerasSinDirector: carrerasSinDirector.length,
    },
    facultades,
    carrerasSinDirector,
    facultadesSinCarreras,
    altasRecientes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/modules/academico/domain/services/estructura-institucional.spec.ts && npm run typecheck && npx eslint src/modules/academico/domain`
Expected: PASS, typecheck clean, lint clean (if lint objects to the unused `_instante` destructure, rename it per the repo's lint config rather than disabling the rule).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/academico/domain/services/estructura-institucional.ts apps/api/src/modules/academico/domain/services/estructura-institucional.spec.ts
git commit -m "feat(academico): función de dominio calcularEstructuraInstitucional"
```

---

### Task 2: `ConteoDeUsuariosPort` in `auth` + adapter + provider

**Files:**
- Create: `apps/api/src/modules/auth/application/ports/conteo-usuarios.port.ts`
- Create: `apps/api/src/modules/auth/infrastructure/conteo-usuarios.adapter.ts`
- Modify: `apps/api/src/app.module.ts` (import both; add `{ provide: CONTEO_USUARIOS, useClass: ConteoDeUsuariosAdapter }` next to the `DIRECTORIO_USUARIOS` provider, ~line 429)
- Test: `apps/api/test/integration/conteo-usuarios.int.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`../../platform/database/prisma.service.js` from tests; existing import style in `directorio-usuarios.adapter.ts` for the adapter).
- Produces (used by Task 3/4): `ConteoPorCarrera`, `ConteoDeUsuariosPort { conteoPorCarrera(ids): Promise<Map<string, ConteoPorCarrera>>; totalUsuariosActivos(): Promise<number> }`, `CONTEO_USUARIOS`, `ConteoDeUsuariosAdapter(prisma)`.

- [ ] **Step 1: Write the port**

```typescript
// apps/api/src/modules/auth/application/ports/conteo-usuarios.port.ts
/**
 * Cuántas personas hay, sin decir quiénes son.
 *
 * `academico` necesita saber cuántos usuarios tiene cada carrera y cuáles no
 * tienen director, y CLAUDE.md §3.2 le prohíbe consultar las tablas de `auth`.
 * Se pide por aquí. Deliberadamente pobre —solo números—, por la misma razón
 * que `DirectorioDeUsuariosPort`: devolver usuarios convertiría este puerto en
 * una puerta trasera al módulo de usuarios.
 */

export interface ConteoPorCarrera {
  /** Usuarios activos asignados a la carrera (cualquier rol acotado a ella). */
  readonly usuarios: number;
  /** De esos, los que tienen el rol DIRECTOR_CARRERA. */
  readonly directores: number;
}

export interface ConteoDeUsuariosPort {
  /** Una entrada por cada id pedido; las carreras sin nadie asignado vienen en cero. */
  conteoPorCarrera(carreraIds: readonly string[]): Promise<Map<string, ConteoPorCarrera>>;
  /** Todas las cuentas activas, tengan o no carrera asignada. */
  totalUsuariosActivos(): Promise<number>;
}

export const CONTEO_USUARIOS = Symbol('ConteoDeUsuariosPort');
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// apps/api/test/integration/conteo-usuarios.int.spec.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ConteoDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/conteo-usuarios.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new ConteoDeUsuariosAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(
  email: string,
  codigoRol: string,
  carreraId: string | null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado,
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('ConteoDeUsuariosAdapter.conteoPorCarrera', () => {
  it('cuenta usuarios y directores activos por carrera', async () => {
    const sis = await crearCarrera('SIS');
    await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await crearUsuario('doc@x.pe', 'DOCENTE', sis);

    const r = await adaptador.conteoPorCarrera([sis]);

    expect(r.get(sis)).toEqual({ usuarios: 2, directores: 1 });
  });

  it('un usuario inactivo asignado a la carrera no suma', async () => {
    const sis = await crearCarrera('SIS');
    await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis, 'INACTIVO');
    await crearUsuario('doc@x.pe', 'DOCENTE', sis);

    const r = await adaptador.conteoPorCarrera([sis]);

    expect(r.get(sis)).toEqual({ usuarios: 1, directores: 0 });
  });

  it('una carrera sin nadie devuelve ceros, y solo se cuentan las carreras pedidas', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', civ);

    const r = await adaptador.conteoPorCarrera([sis]);

    expect(r.get(sis)).toEqual({ usuarios: 0, directores: 0 });
    expect(r.has(civ)).toBe(false);
  });

  it('con una lista vacía devuelve un mapa vacío sin consultar', async () => {
    expect((await adaptador.conteoPorCarrera([])).size).toBe(0);
  });
});

describe('ConteoDeUsuariosAdapter.totalUsuariosActivos', () => {
  it('cuenta las cuentas activas, con o sin carrera', async () => {
    const sis = await crearCarrera('SIS');
    await crearUsuario('adm@x.pe', 'ADMIN_SISTEMA', null);
    await crearUsuario('doc@x.pe', 'DOCENTE', sis);
    await crearUsuario('off@x.pe', 'DOCENTE', null, 'INACTIVO');

    expect(await adaptador.totalUsuariosActivos()).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npm run test:integration -- test/integration/conteo-usuarios.int.spec.ts`
Expected: FAIL — cannot resolve `conteo-usuarios.adapter.js`.

- [ ] **Step 4: Write the adapter**

Mirror the import style at the top of `apps/api/src/modules/auth/infrastructure/directorio-usuarios.adapter.ts` (`Injectable` from `@nestjs/common`, `PrismaService` relative path) — copy those two import lines verbatim, they are not repeated here.

```typescript
// apps/api/src/modules/auth/infrastructure/conteo-usuarios.adapter.ts
// (imports de Injectable y PrismaService: copiar los de directorio-usuarios.adapter.ts)
import type {
  ConteoDeUsuariosPort,
  ConteoPorCarrera,
} from '../application/ports/conteo-usuarios.port.js';

const DIRECTOR = 'DIRECTOR_CARRERA';

/**
 * Único lugar que lee `usuario_carrera`, `usuarios` y `usuario_rol` para contar.
 * Parte de `usuario` (no de `usuarioCarrera`) porque de ahí salen a la vez el
 * estado, los roles y la carrera; un usuario dirige o pertenece a una sola.
 */
@Injectable()
export class ConteoDeUsuariosAdapter implements ConteoDeUsuariosPort {
  constructor(private readonly prisma: PrismaService) {}

  async conteoPorCarrera(carreraIds: readonly string[]): Promise<Map<string, ConteoPorCarrera>> {
    const pedidas = new Set(carreraIds);
    const conteos = new Map<string, { usuarios: number; directores: number }>(
      [...pedidas].map((id) => [id, { usuarios: 0, directores: 0 }]),
    );
    if (pedidas.size === 0) return conteos;

    const filas = await this.prisma.usuario.findMany({
      where: { estado: 'ACTIVO', carreras: { some: { carreraId: { in: [...pedidas] } } } },
      select: {
        carreras: { select: { carreraId: true } },
        roles: { select: { rol: { select: { codigo: true } } } },
      },
    });

    for (const fila of filas) {
      const esDirector = fila.roles.some((r) => r.rol.codigo === DIRECTOR);
      for (const { carreraId } of fila.carreras) {
        const acumulado = conteos.get(carreraId);
        if (!acumulado) continue;
        acumulado.usuarios += 1;
        if (esDirector) acumulado.directores += 1;
      }
    }

    return conteos;
  }

  totalUsuariosActivos(): Promise<number> {
    return this.prisma.usuario.count({ where: { estado: 'ACTIVO' } });
  }
}
```

- [ ] **Step 5: Register the provider**

In `apps/api/src/app.module.ts`: add the two imports next to the `DirectorioDeUsuariosAdapter` imports (~lines 113-116), and directly after the line `{ provide: DIRECTORIO_USUARIOS, useClass: DirectorioDeUsuariosAdapter },` add:

```typescript
    { provide: CONTEO_USUARIOS, useClass: ConteoDeUsuariosAdapter },
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/api && npm run test:integration -- test/integration/conteo-usuarios.int.spec.ts && npm run typecheck`
Expected: PASS (5 tests), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/app.module.ts apps/api/test/integration/conteo-usuarios.int.spec.ts
git commit -m "feat(auth): ConteoDeUsuariosPort y su adaptador Prisma"
```

---

### Task 3: Use case `ConsultarEstructuraInstitucional`

**Files:**
- Create: `apps/api/src/modules/academico/application/use-cases/consultar-estructura-institucional.use-case.ts`
- Test: `apps/api/src/modules/academico/application/use-cases/consultar-estructura-institucional.spec.ts`

**Interfaces:**
- Consumes: `RepositorioFacultadPort`, `RepositorioCarreraPort`, `DatosFacultad`, `DatosCarreraCompleta` (`../ports/academico.port.js`); `ConteoDeUsuariosPort` (Task 2); `AuthorizationPort`; `AccesoDenegado`; `Actor`; `calcularEstructuraInstitucional`, `EstructuraInstitucional` (Task 1).
- Produces (used by Task 4): `class ConsultarEstructuraInstitucional { constructor(facultades, carreras, conteo, autorizacion); ejecutar(actor: Actor): Promise<EstructuraInstitucional> }`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/academico/application/use-cases/consultar-estructura-institucional.spec.ts
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { ConteoDeUsuariosPort } from '../../../auth/application/ports/conteo-usuarios.port.js';
import type {
  DatosCarreraCompleta,
  DatosFacultad,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../ports/academico.port.js';
import { ConsultarEstructuraInstitucional } from './consultar-estructura-institucional.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Administrador del sistema' };

function autorizacion(permitido: boolean, consultados: [string, string, string | null | undefined][] = []): AuthorizationPort {
  return {
    puede: async (usuarioId, permiso, carreraId) => {
      consultados.push([usuarioId, permiso, carreraId]);
      return permitido ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };
}

const facultad = (sobre: Partial<DatosFacultad> & { id: string }): DatosFacultad => ({
  nombre: 'Facultad de Ingeniería',
  activa: true,
  creadoEn: new Date('2026-09-01T00:00:00Z'),
  totalCarreras: 0,
  ...sobre,
});

const carrera = (sobre: Partial<DatosCarreraCompleta> & { id: string; facultadId: string }): DatosCarreraCompleta => ({
  nombre: 'Ing. de Sistemas',
  codigo: 'SIS',
  duracionAnios: 5,
  activa: true,
  creadoEn: new Date('2026-09-02T00:00:00Z'),
  ...sobre,
});

function montar(opciones: { permitido: boolean }) {
  const consultados: [string, string, string | null | undefined][] = [];
  const llamadasAuth = { conteo: [] as (readonly string[])[], total: 0 };

  const facultades = {
    listar: async () => [facultad({ id: 'ing' })],
  } as unknown as RepositorioFacultadPort;
  const carreras = {
    listar: async () => [
      carrera({ id: 'c-activa', facultadId: 'ing' }),
      carrera({ id: 'c-inactiva', facultadId: 'ing', activa: false }),
    ],
  } as unknown as RepositorioCarreraPort;
  const conteo: ConteoDeUsuariosPort = {
    conteoPorCarrera: async (ids) => {
      llamadasAuth.conteo.push(ids);
      return new Map([['c-activa', { usuarios: 2, directores: 1 }]]);
    },
    totalUsuariosActivos: async () => {
      llamadasAuth.total += 1;
      return 7;
    },
  };

  const caso = new ConsultarEstructuraInstitucional(
    facultades,
    carreras,
    conteo,
    autorizacion(opciones.permitido, consultados),
  );
  return { caso, consultados, llamadasAuth };
}

describe('ConsultarEstructuraInstitucional', () => {
  it('sin el permiso lanza AccesoDenegado y no consulta a auth', async () => {
    const { caso, llamadasAuth } = montar({ permitido: false });

    await expect(caso.ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(llamadasAuth.conteo).toEqual([]);
    expect(llamadasAuth.total).toBe(0);
  });

  it('exige usuario.gestionar de forma institucional (sin carrera)', async () => {
    const { caso, consultados } = montar({ permitido: true });

    await caso.ejecutar(ACTOR);

    expect(consultados).toEqual([['u-1', 'usuario.gestionar', null]]);
  });

  it('pide los conteos solo de las carreras activas y devuelve el resumen calculado', async () => {
    const { caso, llamadasAuth } = montar({ permitido: true });

    const r = await caso.ejecutar(ACTOR);

    expect(llamadasAuth.conteo).toEqual([['c-activa']]);
    expect(r.kpis).toEqual({
      facultadesActivas: 1,
      carreras: 1,
      usuariosConAcceso: 7,
      carrerasSinDirector: 0,
    });
    expect(r.facultades[0]).toMatchObject({ usuarios: 2, progreso: 100, estado: 'ACTIVA' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/modules/academico/application/use-cases/consultar-estructura-institucional.spec.ts`
Expected: FAIL — cannot resolve the use case module.

- [ ] **Step 3: Write the use case**

```typescript
// apps/api/src/modules/academico/application/use-cases/consultar-estructura-institucional.use-case.ts
import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { ConteoDeUsuariosPort } from '../../../auth/application/ports/conteo-usuarios.port.js';
import {
  calcularEstructuraInstitucional,
  type EstructuraInstitucional,
} from '../../domain/services/estructura-institucional.js';
import type { RepositorioCarreraPort, RepositorioFacultadPort } from '../ports/academico.port.js';

/**
 * Resumen de la estructura institucional para la vista de inicio del
 * Administrador.
 *
 * El permiso es `usuario.gestionar` y no `facultad.leer`: `facultad.leer` lo
 * tienen todos los roles y la pantalla muestra conteos de usuarios. Se comprueba
 * primero y por completo: sin él no se consulta ni a `auth`.
 */
export class ConsultarEstructuraInstitucional {
  constructor(
    private readonly facultades: RepositorioFacultadPort,
    private readonly carreras: RepositorioCarreraPort,
    private readonly conteo: ConteoDeUsuariosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async ejecutar(actor: Actor): Promise<EstructuraInstitucional> {
    // Sin carrera: la estructura académica es institucional, no de una carrera.
    const decision = await this.autorizacion.puede(actor.id, 'usuario.gestionar', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const [facultades, carreras] = await Promise.all([
      this.facultades.listar(),
      this.carreras.listar(),
    ]);

    const idsActivas = carreras.filter((c) => c.activa).map((c) => c.id);
    const [conteos, usuariosConAcceso] = await Promise.all([
      this.conteo.conteoPorCarrera(idsActivas),
      this.conteo.totalUsuariosActivos(),
    ]);

    return calcularEstructuraInstitucional({ facultades, carreras, conteos, usuariosConAcceso });
  }
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `cd apps/api && npx vitest run src/modules/academico/application/use-cases/consultar-estructura-institucional.spec.ts && npm run typecheck`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/academico/application/use-cases/consultar-estructura-institucional.use-case.ts apps/api/src/modules/academico/application/use-cases/consultar-estructura-institucional.spec.ts
git commit -m "feat(academico): caso de uso ConsultarEstructuraInstitucional"
```

---

### Task 4: Controller, wiring, isolation guard and assembled integration test

**Files:**
- Create: `apps/api/src/modules/academico/infrastructure/http/estructura-institucional.controller.ts`
- Modify: `apps/api/src/app.module.ts` (controllers list ~338-370; providers — use-case factory next to `GestionarFacultades`)
- Modify: `apps/api/src/modules/academico/aislamiento.spec.ts`
- Test: `apps/api/test/integration/estructura-institucional.int.spec.ts`

**Interfaces:**
- Consumes: `ConsultarEstructuraInstitucional` (Task 3), `CONTEO_USUARIOS` (Task 2), `REPOSITORIO_FACULTAD`, `REPOSITORIO_CARRERA`, `AUTHORIZATION_PORT`.
- Produces: `GET /api/v1/estructura-institucional` returning `EstructuraInstitucional` (JSON as in the spec §3.2); consumed by Task 5.

- [ ] **Step 1: Write the failing isolation guard (with positive control)**

Append to `apps/api/src/modules/academico/aislamiento.spec.ts` (after the existing `describe`), and add `join` is already imported:

```typescript
/**
 * `academico` puede pedirle cosas a `auth` —el permiso, los conteos— pero solo
 * por sus puertos: en `application/` y `domain/` lo único importable de `auth`
 * son archivos de `auth/application/ports/`. La infraestructura de `academico`
 * (el controller usa el guard JWT) queda fuera de esta regla a propósito.
 */
const DE_AUTH = /(^|\/)auth\//;
const PUERTO_DE_AUTH = /(^|\/)auth\/application\/ports\/[^/]+$/;

const esImportProhibidoDeAuth = (importado: string) =>
  DE_AUTH.test(importado) && !PUERTO_DE_AUTH.test(importado);

describe('aislamiento de academico hacia auth', () => {
  const capasPuras = ['application', 'domain'].flatMap((capa) => importsDe(join(RAIZ, capa)));

  it('application y domain solo importan de auth archivos de application/ports', () => {
    const infractores = capasPuras
      .filter(({ importado }) => esImportProhibidoDeAuth(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('control positivo: el patrón reconoce lo prohibido y lo permitido', () => {
    expect(esImportProhibidoDeAuth('../../../auth/infrastructure/conteo-usuarios.adapter.js')).toBe(true);
    expect(esImportProhibidoDeAuth('../../../auth/application/use-cases/x.use-case.js')).toBe(true);
    expect(esImportProhibidoDeAuth('../../../auth/application/ports/conteo-usuarios.port.js')).toBe(false);
    expect(esImportProhibidoDeAuth('./oauth-utils.js')).toBe(false);
  });

  it('control positivo: la regla ve de verdad imports de puertos de auth en el código real', () => {
    const dePuertos = capasPuras.filter(({ importado }) => PUERTO_DE_AUTH.test(importado));

    expect(dePuertos.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run guard — expect green except the guard exercises real files**

Run: `cd apps/api && npx vitest run src/modules/academico/aislamiento.spec.ts`
Expected: PASS (Task 3's use case already imports only `auth/application/ports/*`). If `infractores` is non-empty, fix the offending import — do not loosen the regex.

- [ ] **Step 3: Write the controller**

```typescript
// apps/api/src/modules/academico/infrastructure/http/estructura-institucional.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarEstructuraInstitucional } from '../../application/use-cases/consultar-estructura-institucional.use-case.js';

@ApiTags('Estructura institucional')
@ApiBearerAuth()
@Controller('estructura-institucional')
export class EstructuraInstitucionalController {
  constructor(private readonly consultar: ConsultarEstructuraInstitucional) {}

  @Get()
  @ApiOperation({
    summary: 'Resumen de la estructura institucional (vista de inicio del administrador)',
  })
  obtener(@ActorActual() actor: Actor) {
    return this.consultar.ejecutar(actor);
  }
}
```

(`ConsultarEstructuraInstitucional` must stay a value import: Nest's DI reads it from the constructor metadata. If `academico.controller.ts` imports `Actor` differently, follow its style.)

- [ ] **Step 4: Wire it in `app.module.ts`**

1. Import `EstructuraInstitucionalController` and `ConsultarEstructuraInstitucional`.
2. Add `EstructuraInstitucionalController` to `controllers` right after `CarrerasController`.
3. Add this provider right after the `GestionarCarreras` factory:

```typescript
    {
      provide: ConsultarEstructuraInstitucional,
      inject: [REPOSITORIO_FACULTAD, REPOSITORIO_CARRERA, CONTEO_USUARIOS, AUTHORIZATION_PORT],
      useFactory: (
        facultades: RepositorioFacultadPort,
        carreras: RepositorioCarreraPort,
        conteo: ConteoDeUsuariosPort,
        autorizacion: AuthorizationPort,
      ) => new ConsultarEstructuraInstitucional(facultades, carreras, conteo, autorizacion),
    },
```

(add the `type` imports for `RepositorioCarreraPort` and `ConteoDeUsuariosPort` if not already imported.)

- [ ] **Step 5: Write the assembled integration test**

The repo has no HTTP-level API harness (`apps/api/test/e2e` is empty), so the endpoint's behavior is verified by assembling the real use case over the real repositories and adapter against the ephemeral DB, plus the boot check in Step 7.

```typescript
// apps/api/test/integration/estructura-institucional.int.spec.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ConsultarEstructuraInstitucional } from '../../src/modules/academico/application/use-cases/consultar-estructura-institucional.use-case.js';
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import type { AuthorizationPort } from '../../src/modules/auth/application/ports/authorization.port.js';
import { ConteoDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/conteo-usuarios.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { AccesoDenegado } from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();
const ACTOR = { id: 'u-admin', nombre: 'Administrador' };

const autorizacion = (permitido: boolean): AuthorizationPort => ({
  puede: async () => (permitido ? { permitido: true } : { permitido: false, motivo: 'no' }),
  permisosDe: async () => new Set(),
  carreraACargoDe: async () => null,
  rolesDe: async () => [],
});

const montar = (permitido: boolean) =>
  new ConsultarEstructuraInstitucional(
    new FacultadRepositoryPrisma(prisma),
    new CarreraRepositoryPrisma(prisma),
    new ConteoDeUsuariosAdapter(prisma),
    autorizacion(permitido),
  );

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function usuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  await prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('estructura institucional contra la base real', () => {
  it('sin permiso lanza AccesoDenegado', async () => {
    await expect(montar(false).ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('los conteos y las listas cuadran con los datos sembrados', async () => {
    const ing = await prisma.facultad.create({ data: { nombre: 'Facultad de Ingeniería' } });
    await prisma.facultad.create({ data: { nombre: 'Facultad de Derecho' } });
    const off = await prisma.facultad.create({
      data: { nombre: 'Facultad de Humanidades', estado: 'INACTIVO' },
    });
    const sis = await prisma.carrera.create({
      data: { facultadId: ing.id, nombre: 'Ing. de Sistemas', codigo: 'SIS', duracionAnios: 5 },
    });
    await prisma.carrera.create({
      data: { facultadId: ing.id, nombre: 'Ing. Civil', codigo: 'CIV', duracionAnios: 5 },
    });
    await usuario('dir@x.pe', 'DIRECTOR_CARRERA', sis.id);
    await usuario('doc@x.pe', 'DOCENTE', sis.id);
    await usuario('adm@x.pe', 'ADMIN_SISTEMA', null);

    const r = await montar(true).ejecutar(ACTOR);

    expect(r.kpis).toEqual({
      facultadesActivas: 2,
      carreras: 2,
      usuariosConAcceso: 3,
      carrerasSinDirector: 1,
    });
    expect(r.facultades.map((f) => [f.codigo, f.estado])).toEqual([
      ['DER', 'REVISAR'],
      ['HUM', 'INACTIVA'],
      ['ING', 'REVISAR'],
    ]);
    expect(r.facultades.find((f) => f.id === off.id)?.activa).toBe(false);
    expect(r.carrerasSinDirector.map((c) => c.nombre)).toEqual(['Ing. Civil']);
    expect(r.facultadesSinCarreras.map((f) => f.nombre)).toEqual(['Facultad de Derecho']);
    expect(r.facultades.find((f) => f.codigo === 'ING')).toMatchObject({ usuarios: 2, progreso: 50 });
  });
});
```

- [ ] **Step 6: Run integration + full API unit suite + typecheck + lint**

Run: `cd apps/api && npm run test:integration -- test/integration/estructura-institucional.int.spec.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS. (`facultadesActivas` counts the inactive Humanidades out: Ingeniería + Derecho = 2.)

- [ ] **Step 7: Boot check of the real route**

Run (in `apps/api`, DB env configured as for e2e): `npm run build && THROTTLE_LIMIT=10000 npm start &`, then
`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/estructura-institucional`
Expected: `401` (route exists and is protected by the global `JwtGuard`; a `404` means the controller is not registered). Stop the server afterwards.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/academico apps/api/src/app.module.ts apps/api/test/integration/estructura-institucional.int.spec.ts
git commit -m "feat(academico): GET /estructura-institucional y guardia de aislamiento hacia auth"
```

---

### Task 5: Frontend API client and view helpers

**Files:**
- Create: `apps/web/src/features/dashboard/api/estructura.api.ts`
- Create: `apps/web/src/features/dashboard/domain/vista-admin.ts`
- Test: `apps/web/src/features/dashboard/api/estructura.api.test.ts`
- Test: `apps/web/src/features/dashboard/domain/vista-admin.test.ts`

**Interfaces:**
- Consumes: `cliente` from `@/shared/api/cliente` (`cliente.get<T>(ruta)`); types `FilaDataPanel`, `ItemPendiente`, `TarjetaSecundaria` from `@/shared/components/ui`.
- Produces (used by Tasks 6-7): `EstructuraInstitucional`, `FacultadResumen`, `AltaReciente`, `obtenerEstructuraInstitucional()`, and from `domain/vista-admin.ts`: `plural(n, uno, varios): string`, `filaDeFacultad(f): FilaDataPanel`, `pendientesDe(e, maximo?): ItemPendiente[]`, `tarjetasDeAltas(altas): TarjetaSecundaria[]`.

- [ ] **Step 1: Write the API client and its test**

```typescript
// apps/web/src/features/dashboard/api/estructura.api.ts
import { cliente } from '@/shared/api/cliente';

export type EstadoFacultad = 'ACTIVA' | 'REVISAR' | 'INACTIVA';

export interface FacultadResumen {
  id: string;
  nombre: string;
  codigo: string;
  activa: boolean;
  carreras: number;
  usuarios: number;
  carrerasSinDirector: number;
  progreso: number;
  estado: EstadoFacultad;
}

export interface AltaReciente {
  tipo: 'CARRERA' | 'FACULTAD';
  id: string;
  nombre: string;
  contexto: string;
  creadoEn: string;
}

export interface EstructuraInstitucional {
  kpis: {
    facultadesActivas: number;
    carreras: number;
    usuariosConAcceso: number;
    carrerasSinDirector: number;
  };
  facultades: FacultadResumen[];
  carrerasSinDirector: { id: string; nombre: string; facultad: string }[];
  facultadesSinCarreras: { id: string; nombre: string }[];
  altasRecientes: AltaReciente[];
}

export function obtenerEstructuraInstitucional(): Promise<EstructuraInstitucional> {
  return cliente.get<EstructuraInstitucional>('/estructura-institucional');
}
```

```typescript
// apps/web/src/features/dashboard/api/estructura.api.test.ts
import { describe, expect, it, vi } from 'vitest';

import { cliente } from '@/shared/api/cliente';

import { obtenerEstructuraInstitucional } from './estructura.api';

describe('obtenerEstructuraInstitucional', () => {
  it('pide GET /estructura-institucional y devuelve el cuerpo tal cual', async () => {
    const cuerpo = { kpis: {}, facultades: [] };
    const get = vi.spyOn(cliente, 'get').mockResolvedValue(cuerpo);

    await expect(obtenerEstructuraInstitucional()).resolves.toBe(cuerpo);
    expect(get).toHaveBeenCalledWith('/estructura-institucional');
  });
});
```

- [ ] **Step 2: Write the failing helpers test**

```typescript
// apps/web/src/features/dashboard/domain/vista-admin.test.ts
import { describe, expect, it } from 'vitest';

import type { EstructuraInstitucional, FacultadResumen } from '../api/estructura.api';
import { filaDeFacultad, pendientesDe, plural, tarjetasDeAltas } from './vista-admin';

const facultad = (sobre: Partial<FacultadResumen> = {}): FacultadResumen => ({
  id: 'f1',
  nombre: 'Facultad de Ingeniería',
  codigo: 'ING',
  activa: true,
  carreras: 3,
  usuarios: 1,
  carrerasSinDirector: 0,
  progreso: 100,
  estado: 'ACTIVA',
  ...sobre,
});

const estructura = (sobre: Partial<EstructuraInstitucional> = {}): EstructuraInstitucional => ({
  kpis: { facultadesActivas: 0, carreras: 0, usuariosConAcceso: 0, carrerasSinDirector: 0 },
  facultades: [],
  carrerasSinDirector: [],
  facultadesSinCarreras: [],
  altasRecientes: [],
  ...sobre,
});

describe('plural', () => {
  it('singular con 1, plural con el resto (incluido 0)', () => {
    expect(plural(1, 'carrera', 'carreras')).toBe('1 carrera');
    expect(plural(0, 'carrera', 'carreras')).toBe('0 carreras');
    expect(plural(4, 'carrera', 'carreras')).toBe('4 carreras');
  });
});

describe('filaDeFacultad', () => {
  it('mapea código, meta, progreso, enlace y chip', () => {
    expect(filaDeFacultad(facultad())).toEqual({
      id: 'f1',
      tag: 'ING',
      titulo: 'Facultad de Ingeniería',
      meta: '3 carreras · 1 usuario',
      progreso: 100,
      chip: { texto: 'Activa', tono: 'activo' },
      href: '/plan-estudios',
    });
  });

  it.each([
    ['REVISAR', 'Revisar', 'progreso'],
    ['INACTIVA', 'Inactiva', 'inactivo'],
  ] as const)('estado %s → chip %s / tono %s', (estado, texto, tono) => {
    expect(filaDeFacultad(facultad({ estado })).chip).toEqual({ texto, tono });
  });
});

describe('pendientesDe', () => {
  it('lista primero las carreras sin director y luego las facultades sin carreras', () => {
    const items = pendientesDe(
      estructura({
        carrerasSinDirector: [{ id: 'c1', nombre: 'Ing. Civil', facultad: 'Facultad de Ingeniería' }],
        facultadesSinCarreras: [{ id: 'f2', nombre: 'Facultad de Salud' }],
      }),
    );

    expect(items).toEqual([
      {
        id: 'carrera-c1',
        texto: 'Asignar director a Ing. Civil · Carrera sin responsable',
        urgente: true,
        href: '/usuarios',
      },
      {
        id: 'facultad-f2',
        texto: 'Registrar carreras de Facultad de Salud · Facultad creada sin carreras',
        href: '/plan-estudios',
      },
    ]);
  });

  it('respeta el máximo de 5, conservando las carreras primero', () => {
    const carreras = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i}`,
      nombre: `Carrera ${i}`,
      facultad: 'F',
    }));
    const facultades = Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, nombre: `Fac ${i}` }));

    const items = pendientesDe(
      estructura({ carrerasSinDirector: carreras, facultadesSinCarreras: facultades }),
    );

    expect(items).toHaveLength(5);
    expect(items.slice(0, 4).every((i) => i.id.startsWith('carrera-'))).toBe(true);
    expect(items[4]?.id).toBe('facultad-f0');
  });

  it('sin pendientes devuelve una lista vacía', () => {
    expect(pendientesDe(estructura())).toEqual([]);
  });
});

describe('tarjetasDeAltas', () => {
  it('etiqueta el tipo, muestra el nombre y une contexto y fecha', () => {
    const [tarjeta] = tarjetasDeAltas([
      {
        tipo: 'CARRERA',
        id: 'c1',
        nombre: 'Ing. Civil',
        contexto: 'Facultad de Ingeniería',
        creadoEn: '2026-09-12T12:00:00.000Z',
      },
    ]);

    expect(tarjeta).toMatchObject({
      id: 'CARRERA-c1',
      titulo: 'Carrera',
      valor: 'Ing. Civil',
    });
    expect(tarjeta?.detalle).toMatch(/^Facultad de Ingeniería · /);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/features/dashboard/domain/vista-admin.test.ts src/features/dashboard/api/estructura.api.test.ts`
Expected: helpers test FAIL (module missing); API test PASS (client already written).

- [ ] **Step 4: Write the helpers**

```typescript
// apps/web/src/features/dashboard/domain/vista-admin.ts
/**
 * Traducciones de la respuesta de `/estructura-institucional` a las props de
 * los componentes de Fase 0e. Funciones puras: la página solo las compone.
 */

import type {
  FilaDataPanel,
  ItemPendiente,
  TarjetaSecundaria,
} from '@/shared/components/ui';

import type { AltaReciente, EstadoFacultad, EstructuraInstitucional, FacultadResumen } from '../api/estructura.api';

export const MAXIMO_PENDIENTES = 5;

export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

const CHIP: Record<EstadoFacultad, NonNullable<FilaDataPanel['chip']>> = {
  ACTIVA: { texto: 'Activa', tono: 'activo' },
  REVISAR: { texto: 'Revisar', tono: 'progreso' },
  INACTIVA: { texto: 'Inactiva', tono: 'inactivo' },
};

export function filaDeFacultad(f: FacultadResumen): FilaDataPanel {
  return {
    id: f.id,
    tag: f.codigo,
    titulo: f.nombre,
    meta: `${plural(f.carreras, 'carrera', 'carreras')} · ${plural(f.usuarios, 'usuario', 'usuarios')}`,
    progreso: f.progreso,
    chip: CHIP[f.estado],
    href: '/plan-estudios',
  };
}

/** Carreras sin director primero (son lo urgente), luego facultades sin carreras. */
export function pendientesDe(
  e: EstructuraInstitucional,
  maximo: number = MAXIMO_PENDIENTES,
): ItemPendiente[] {
  const deCarreras: ItemPendiente[] = e.carrerasSinDirector.map((c) => ({
    id: `carrera-${c.id}`,
    texto: `Asignar director a ${c.nombre} · Carrera sin responsable`,
    urgente: true,
    href: '/usuarios',
  }));
  const deFacultades: ItemPendiente[] = e.facultadesSinCarreras.map((f) => ({
    id: `facultad-${f.id}`,
    texto: `Registrar carreras de ${f.nombre} · Facultad creada sin carreras`,
    href: '/plan-estudios',
  }));
  return [...deCarreras, ...deFacultades].slice(0, maximo);
}

export function tarjetasDeAltas(altas: readonly AltaReciente[]): TarjetaSecundaria[] {
  return altas.map((a) => ({
    id: `${a.tipo}-${a.id}`,
    titulo: a.tipo === 'CARRERA' ? 'Carrera' : 'Facultad',
    valor: a.nombre,
    detalle: `${a.contexto} · ${new Date(a.creadoEn).toLocaleDateString('es-PE')}`,
  }));
}
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `cd apps/web && npx vitest run src/features/dashboard && npm run typecheck && npx eslint src/features/dashboard && npx prettier --check src/features/dashboard`
Expected: PASS. If prettier complains, run `npx prettier --write src/features/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/dashboard/api apps/web/src/features/dashboard/domain
git commit -m "feat(dashboard): cliente de estructura institucional y traductores de vista"
```

---

### Task 6: `AccionRecomendada` component

**Files:**
- Create: `apps/web/src/features/dashboard/components/AccionRecomendada.tsx`
- Test: `apps/web/src/features/dashboard/components/AccionRecomendada.test.tsx`

**Interfaces:**
- Consumes: `plural` (Task 5).
- Produces (used by Task 7): `AccionRecomendada({ carreras }: { carreras: readonly { id: string; nombre: string }[] })` — renders `null` when the list is empty.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/dashboard/components/AccionRecomendada.test.tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AccionRecomendada } from './AccionRecomendada';

const montar = (nombres: string[]) =>
  render(
    <MemoryRouter>
      <AccionRecomendada carreras={nombres.map((nombre, i) => ({ id: `c${i}`, nombre }))} />
    </MemoryRouter>,
  );

describe('AccionRecomendada', () => {
  it('no renderiza nada sin carreras sin director', () => {
    const { container } = montar([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('con una carrera usa el singular y la nombra', () => {
    montar(['Ing. Civil']);
    expect(screen.getByText('1 carrera sin director asignado')).toBeInTheDocument();
    expect(screen.getByText('Ing. Civil')).toBeInTheDocument();
  });

  it('con dos las nombra a las dos', () => {
    montar(['Ing. Civil', 'Derecho']);
    expect(screen.getByText('2 carreras sin director asignado')).toBeInTheDocument();
    expect(screen.getByText('Ing. Civil, Derecho')).toBeInTheDocument();
  });

  it('con más de dos nombra las primeras dos y cuenta el resto', () => {
    montar(['A', 'B', 'C', 'D']);
    expect(screen.getByText('4 carreras sin director asignado')).toBeInTheDocument();
    expect(screen.getByText('A, B y 2 más')).toBeInTheDocument();
  });

  it('su botón lleva a /usuarios', () => {
    montar(['Ing. Civil']);
    expect(screen.getByRole('link', { name: 'Asignar responsables' })).toHaveAttribute(
      'href',
      '/usuarios',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/dashboard/components/AccionRecomendada.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the component**

```tsx
// apps/web/src/features/dashboard/components/AccionRecomendada.tsx
/**
 * Tarjeta de la acción más útil ahora mismo en la vista del Administrador:
 * asignar director a las carreras que no lo tienen.
 *
 * Propia de esta vista y no del catálogo compartido: nada más la usa. Los
 * colores son los mismos tokens del degradado de `ResumenGenerico`.
 */

import { Link } from 'react-router-dom';

import { plural } from '../domain/vista-admin';

interface Props {
  readonly carreras: readonly { id: string; nombre: string }[];
}

const NOMBRADAS = 2;

function nombresDe(carreras: Props['carreras']): string {
  const nombres = carreras.slice(0, NOMBRADAS).map((c) => c.nombre).join(', ');
  const resto = carreras.length - NOMBRADAS;
  return resto > 0 ? `${nombres} y ${resto} más` : nombres;
}

export function AccionRecomendada({ carreras }: Props) {
  if (carreras.length === 0) return null;

  return (
    <section
      aria-label="Acción recomendada"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-uc-primary via-uc-v1 to-uc-dark p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-uc-v2 opacity-30"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Acción recomendada</p>
          <p className="mt-1 text-lg font-semibold">
            {plural(carreras.length, 'carrera', 'carreras')} sin director asignado
          </p>
          <p className="text-sm">{nombresDe(carreras)}</p>
        </div>
        <Link
          to="/usuarios"
          className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-uc-primary transition hover:brightness-95"
        >
          Asignar responsables
        </Link>
      </div>
    </section>
  );
}
```

Note the title is composed as `"{n} carrera(s)"` + `" sin director asignado"` in one text node via a template — the test's `getByText('1 carrera sin director asignado')` matches because the JSX renders `{plural(...)} sin director asignado` as adjacent text within the same `<p>`.

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `cd apps/web && npx vitest run src/features/dashboard/components && npm run typecheck && npx eslint src/features/dashboard && npx prettier --check src/features/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/components
git commit -m "feat(dashboard): componente AccionRecomendada"
```

---

### Task 7: `VistaAdminInicio` view + fix `ResumenPage.test.tsx`

**Files:**
- Modify: `apps/web/src/features/dashboard/pages/VistaAdminInicio.tsx` (replace the stub entirely)
- Modify: `apps/web/src/features/dashboard/pages/ResumenPage.test.tsx` (lines 26-42: QueryClientProvider + admin case)
- Test: `apps/web/src/features/dashboard/pages/VistaAdminInicio.test.tsx`

**Interfaces:**
- Consumes: `obtenerEstructuraInstitucional`, `EstructuraInstitucional` (Task 5); `filaDeFacultad`, `pendientesDe`, `tarjetasDeAltas` (Task 5); `AccionRecomendada` (Task 6); `KpiCard`, `DataPanel`, `PendingList`, `SecondaryCardGrid`, `ReportBridgeCard`, `Boton` from `@/shared/components/ui`.
- Produces: `VistaAdminInicio` (zero-prop named export, unchanged contract for `ResumenPage`).

- [ ] **Step 1: Write the failing view test**

```tsx
// apps/web/src/features/dashboard/pages/VistaAdminInicio.test.tsx
/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/estructura.api';
import type { EstructuraInstitucional } from '../api/estructura.api';
import { VistaAdminInicio } from './VistaAdminInicio';

const completa: EstructuraInstitucional = {
  kpis: { facultadesActivas: 4, carreras: 14, usuariosConAcceso: 62, carrerasSinDirector: 2 },
  facultades: [
    {
      id: 'ing',
      nombre: 'Facultad de Ingeniería',
      codigo: 'ING',
      activa: true,
      carreras: 5,
      usuarios: 30,
      carrerasSinDirector: 1,
      progreso: 80,
      estado: 'REVISAR',
    },
  ],
  carrerasSinDirector: [
    { id: 'c1', nombre: 'Ing. Civil', facultad: 'Facultad de Ingeniería' },
    { id: 'c2', nombre: 'Derecho', facultad: 'Facultad de Derecho' },
  ],
  facultadesSinCarreras: [{ id: 'sal', nombre: 'Facultad de Ciencias de la Salud' }],
  altasRecientes: [
    {
      tipo: 'CARRERA',
      id: 'c1',
      nombre: 'Ing. Civil',
      contexto: 'Facultad de Ingeniería',
      creadoEn: '2026-09-12T12:00:00.000Z',
    },
  ],
};

const limpia: EstructuraInstitucional = {
  ...completa,
  kpis: { ...completa.kpis, carrerasSinDirector: 0 },
  carrerasSinDirector: [],
  facultadesSinCarreras: [],
  altasRecientes: [],
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VistaAdminInicio />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('VistaAdminInicio', () => {
  it('con datos completos muestra KPIs, facultades, acción recomendada, pendientes y altas', async () => {
    vi.spyOn(api, 'obtenerEstructuraInstitucional').mockResolvedValue(completa);
    montar();

    expect(await screen.findByRole('heading', { name: 'Estructura institucional' })).toBeVisible();
    expect(screen.getByText('Facultades activas')).toBeVisible();
    expect(screen.getByText('62')).toBeVisible();
    expect(screen.getByText('Facultad de Ingeniería')).toBeVisible();
    expect(screen.getByText('2 carreras sin director asignado')).toBeVisible();
    expect(screen.getByText(/Asignar director a Ing\. Civil/)).toBeVisible();
    expect(screen.getByText(/Registrar carreras de Facultad de Ciencias de la Salud/)).toBeVisible();
    expect(screen.getByText('Altas recientes')).toBeVisible();
    expect(screen.getByRole('link', { name: /Reportes/ })).toBeVisible();
  });

  it('sin carreras sin director no aparece la tarjeta morada y las altas vacías dejan su texto', async () => {
    vi.spyOn(api, 'obtenerEstructuraInstitucional').mockResolvedValue(limpia);
    montar();

    await screen.findByRole('heading', { name: 'Estructura institucional' });
    expect(screen.queryByText(/sin director asignado/)).not.toBeInTheDocument();
    expect(screen.getByText('Sin altas recientes.')).toBeVisible();
  });

  it('mientras carga muestra el esqueleto anunciado, no el contenido', () => {
    vi.spyOn(api, 'obtenerEstructuraInstitucional').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByRole('status', { name: 'Cargando estructura institucional' })).toBeVisible();
    expect(screen.queryByText('Facultades activas')).not.toBeInTheDocument();
  });

  it('si falla muestra el error dentro de la vista y Reintentar vuelve a pedir', async () => {
    const pedir = vi
      .spyOn(api, 'obtenerEstructuraInstitucional')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(completa);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la estructura institucional.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Estructura institucional' })).toBeVisible();
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/dashboard/pages/VistaAdminInicio.test.tsx`
Expected: FAIL — the stub renders "Vista de Administrador — contenido pendiente".

- [ ] **Step 3: Replace the stub with the view**

```tsx
// apps/web/src/features/dashboard/pages/VistaAdminInicio.tsx
/**
 * Vista de inicio del Administrador institucional (`ADMIN_SISTEMA`):
 * «Estructura institucional».
 *
 * Todo sale de una sola consulta a `/estructura-institucional`; el cálculo vive
 * en el backend (`calcularEstructuraInstitucional`) y la traducción a props en
 * `domain/vista-admin.ts`. Esta página solo compone.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  Boton,
  DataPanel,
  KpiCard,
  PendingList,
  ReportBridgeCard,
  SecondaryCardGrid,
} from '@/shared/components/ui';

import { obtenerEstructuraInstitucional } from '../api/estructura.api';
import { AccionRecomendada } from '../components/AccionRecomendada';
import { filaDeFacultad, pendientesDe, tarjetasDeAltas } from '../domain/vista-admin';

/** Mismas proporciones que la vista cargada, para que no salte de tamaño. */
function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div
      role="status"
      aria-label="Cargando estructura institucional"
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloque} h-24`} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${bloque} h-64`} />
        <div className={`${bloque} h-64`} />
      </div>
    </div>
  );
}

export function VistaAdminInicio() {
  const consulta = useQuery({
    queryKey: ['estructura-institucional'],
    queryFn: obtenerEstructuraInstitucional,
  });

  if (consulta.isPending) return <Esqueleto />;

  if (consulta.isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6">
        <p className="text-sm text-tinta">No se pudo cargar la estructura institucional.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const e = consulta.data;
  const altas = tarjetasDeAltas(e.altasRecientes);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-tinta">Estructura institucional</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard etiqueta="Facultades activas" valor={e.kpis.facultadesActivas} />
        <KpiCard etiqueta="Carreras" valor={e.kpis.carreras} />
        <KpiCard etiqueta="Usuarios con acceso" valor={e.kpis.usuariosConAcceso} />
        <KpiCard etiqueta="Carreras sin director" valor={e.kpis.carrerasSinDirector} />
      </div>

      <AccionRecomendada carreras={e.carrerasSinDirector} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <DataPanel
            titulo="Facultades"
            filas={e.facultades.map(filaDeFacultad)}
            vacio="Aún no hay facultades registradas."
          />
          <Link to="/plan-estudios" className="text-sm font-semibold text-uc-primary">
            Ver todo
          </Link>
        </div>
        <PendingList
          titulo="Pendientes de estructura"
          items={pendientesDe(e)}
          vacio="No hay pendientes de estructura."
        />
      </div>

      <section aria-labelledby="altas-recientes" className="space-y-3">
        <h2 id="altas-recientes" className="text-sm font-semibold text-tinta">
          Altas recientes
        </h2>
        {altas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin altas recientes.</p>
        ) : (
          <SecondaryCardGrid items={altas} />
        )}
      </section>

      <ReportBridgeCard
        titulo="Reportes"
        descripcion="Consulta los reportes de cobertura y estado de los planes de estudio."
      />
    </div>
  );
}
```

If `Altas recientes` collides with a heading rendered by another component in the test (`getByText` finds two), scope the query with `getByRole('heading', { name: 'Altas recientes' })` instead — do not rename the heading.

- [ ] **Step 4: Fix `ResumenPage.test.tsx`**

Replace lines 26-42 (the `montar` helper and the ADMIN case) with a version that provides a `QueryClientProvider` and a pending request, and asserts the skeleton:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import * as estructuraApi from '../api/estructura.api';
```
(add to the imports; merge `vi` into the existing `vitest` import line), then:

```tsx
function montar(vistaActiva: RolVista | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
          <ContextoSesion.Provider value={{ ...sesionBase, vistaActiva }}>
            <ResumenPage />
          </ContextoSesion.Provider>
        </CtxEncabezado.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResumenPage — despachador por rol', () => {
  it('ADMIN_SISTEMA muestra VistaAdminInicio', () => {
    // Petición que no resuelve: basta el esqueleto propio de la vista para
    // saber que el despachador montó `VistaAdminInicio` y no otra.
    vi.spyOn(estructuraApi, 'obtenerEstructuraInstitucional').mockReturnValue(
      new Promise(() => undefined),
    );
    montar('ADMIN_SISTEMA');
    expect(
      screen.getByRole('status', { name: 'Cargando estructura institucional' }),
    ).toBeInTheDocument();
  });
```
Leave the remaining five tests untouched.

- [ ] **Step 5: Run the dashboard suite + typecheck + lint + format**

Run: `cd apps/web && npx vitest run src/features/dashboard && npm run typecheck && npm run lint && npm run format:check`
Expected: all PASS. Fix prettier with `npx prettier --write src/features/dashboard` if needed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/dashboard
git commit -m "feat(dashboard): vista de inicio del Administrador — estructura institucional"
```

---

### Task 8: Accessibility e2e for the Admin view + final verification

**Files:**
- Modify: `tests/e2e/global-setup.ts` (add `admin` account; update the two "tres/three accesos" comments)
- Modify: `tests/e2e/README.md` (add the admin account creation command; "cuatro cuentas" → "cinco cuentas" where it counts them)
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (new describe at the end)

**Interfaces:**
- Consumes: `Rol` type derived from `CUENTAS`; the `test`/`expect` fixtures (`rol` option); `analizar(page, nombre)`.
- Produces: `CUENTAS.admin` (`e2e-admin@sgc.local`, role `ADMIN_SISTEMA`, no career) → `.auth/admin.json`.

- [ ] **Step 1: Add the account**

In `tests/e2e/global-setup.ts`:

```typescript
export const CUENTAS = {
  editor: { email: 'e2e-editor@sgc.local' },
  lector: { email: 'e2e-lector@sgc.local' },
  director: { email: 'e2e-director@sgc.local' },
  admin: { email: 'e2e-admin@sgc.local' },
} as const;
```

Update the login-budget messages: "esta suite gasta tres por ejecución" → "cuatro por ejecución" (the login limit is five per minute, so four still fits). In `tests/e2e/README.md`, after the director command in section 3, add:

```bash
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-admin@sgc.local --nombre "E2E Admin" \
  --rol ADMIN_SISTEMA
```
and change "Las cuatro cuentas" to "Las cinco cuentas". (`crear-usuario.ts` only requires `--carrera` for roles in `ROLES_CON_CARRERA`; confirm `ADMIN_SISTEMA` is not in that set at `apps/api/scripts/crear-usuario.ts:31`.)

- [ ] **Step 2: Write the e2e test**

Append to `tests/e2e/specs/accesibilidad.spec.ts`:

```typescript
test.describe('con la cuenta de administrador', () => {
  // La vista de inicio depende del rol: `editor` cae en el resumen genérico,
  // que ya cubre la prueba «el resumen». Solo `ADMIN_SISTEMA` ve «Estructura
  // institucional» (`usuario.gestionar`).
  test.use({ rol: 'admin' });

  test('la vista de inicio del administrador', async ({ page }) => {
    await page.goto('/');
    // Con contenido real: esperar al encabezado descarta analizar el esqueleto
    // de carga, que no distingue «sin problemas» de «axe nunca vio los datos».
    await expect(page.getByRole('heading', { name: 'Estructura institucional' })).toBeVisible();

    await analizar(page, 'la vista de inicio del administrador');
  });
});
```

- [ ] **Step 3: Run the e2e accessibility spec**

Prepare as in `tests/e2e/README.md` (DB, seed, `e2e:preparar`, the five accounts, API with `THROTTLE_LIMIT=10000`), then:
Run: `npx playwright test tests/e2e/specs/accesibilidad.spec.ts -g "administrador"` (from the directory the README specifies)
Expected: PASS with zero axe violations. If axe reports contrast or heading-order violations, fix the offending token/heading in the view (Tasks 6-7 files) — do not add axe exclusions.

- [ ] **Step 4: Full verification**

Run:
```bash
cd apps/api && npm test && npm run test:integration && npm run typecheck && npm run lint && npm run format:check
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check
```
Expected: all green; API coverage of `domain/` and `application/` still ≥ 80% (`cd apps/api && npm run test:coverage`).

- [ ] **Step 5: Update the OpenAPI/README notes if the repo tracks endpoints by hand**

Run: `rg -n "facultades" docs --glob '*.md' -l`
If a hand-maintained endpoint list exists, add `GET /estructura-institucional` (permiso `usuario.gestionar`); if none, skip. Swagger is auto-generated from the controller decorators.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): accesibilidad de la vista de inicio del Administrador"
```

---

## Self-Review

**Spec coverage**
- §3.1 port + adapter (active only) → Task 2. §3.2 endpoint, permission, shape, use case → Tasks 3-4. §3.3 derived rules (code, active-only, progress, state, KPI coherence, lists order, altas cap/tie-break) → Task 1 tests, one per rule. §3.4 isolation guard + positive control → Task 4 step 1.
- §4 frontend: composition with existing components, `AccionRecomendada` (only when non-empty, link `/usuarios`), links to `/plan-estudios`, pendientes max 5 carreras-first, single `useQuery` key `['estructura-institucional']`, existing tokens → Tasks 5-7.
- §5 loading skeleton / error with retry / empty pendings / empty altas → Task 7 tests.
- §6 testing: domain, use case with fake ports + denial doesn't touch auth, adapter, guard, frontend states, axe → Tasks 1-4, 7, 8. **Deviation:** the spec asks for endpoint-level 403/200 integration; the repo has no API HTTP harness, so Task 4 tests the assembled use case over real repos/adapter and adds a `401` boot check. Say so in the PR.
- §7-8: limitations/out-of-scope respected (no request flow, no `codigo` column, no other role views).

**Placeholder scan:** the only "copy from" instructions are the two import lines of an adapter (Task 2, step 4) and the `Actor` import style (Task 4, step 3), each pointing at an exact file; everything else is literal code.

**Type consistency:** `ConteoDeCarrera` (domain) ≡ `ConteoPorCarrera` (port) structurally; `EstructuraInstitucional`/`FilaFacultad`/`AltaReciente` on the API match `estructura.api.ts` field-for-field (`facultades[].activa` included); `plural`, `filaDeFacultad`, `pendientesDe`, `tarjetasDeAltas` names are identical in Tasks 5, 6 and 7; `ejecutar(actor)` is the use-case method in Tasks 3, 4.
