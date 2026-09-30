# Cambios MVP1 — Bloque 2: rol Docente y gestión de docentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Director de carrera registre, cambie la contraseña, inactive, reactive y elimine a los docentes de su carrera desde una sección «Docentes», y que el rol Docente quede limitado a Planes de Mejora, «Mis evidencias» y su inicio (RF-CH-006, 010 a 014).

**Architecture:** Un caso de uso nuevo `GestionarDocentes` en `auth` (permiso propio `docente.gestionar`, siempre acotado a la carrera del Director) sobre el repositorio de usuarios existente. El borrado consulta un puerto `DocenteEnUsoPort` que `auth` define y `mejora-continua` implementa contra sus tres tablas, sin que ningún módulo lea las tablas del otro. En la web, una página `DocentesPage` cuelga de «Secciones de este plan», y los permisos de *acceder* a un módulo se separan de los de *leer* sus datos (`evaluacion.acceder`, `criterio.acceder`), como el Bloque 1 hizo con `plan.acceder`.

**Tech Stack:** NestJS + Prisma + Vitest (apps/api, `npm test` unitarias, `npm run test:integration` contra PostgreSQL desechable), React + react-query + Vitest/Testing Library (apps/web), Playwright + axe (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-09-29-cambios-mvp1-b2-docentes-design.md`

## Global Constraints

- El correo es el usuario del docente: obligatorio, con formato de correo, único en todo el sistema y comparado en minúsculas (RF-CH-011 RN2).
- La contraseña la escribe el Director, mínimo 8 caracteres, máximo 128; nunca aparece en un evento, en la bitácora ni en una respuesta HTTP.
- La carrera del docente es la del Director que lo crea, sin selector y sin poder editarse (RF-CH-012).
- Solo se gestionan las cuentas de la carrera del Director **cuyo único rol es DOCENTE**; cualquier otra responde `NoEncontrado` (404), nunca 403.
- Eliminar solo si no hay referencias en `AsignaturaEvaluada.docenteId`, `ConfiguracionCompetencia.responsableId` ni `Evidencia.registradaPorId`; si las hay, se bloquea y se sugiere inactivar.
- Los endpoints nuevos usan el prefijo `/carrera/docentes`; el `GET /docentes` de evaluación no se toca.
- El Docente conserva «Mis evidencias» y su inicio; no gana ni pierde nada más que lo listado en la Tarea 1.
- Código, comentarios y textos de interfaz en español neutro, como el resto del proyecto. Commits convencionales en español, **sin** `Co-Authored-By` ni atribución de IA.
- **Base de datos:** las pruebas de integración hacen `TRUNCATE`. Nunca se ejecutan con `SGC_DB_DESECHABLE=1` contra la base de desarrollo; usar una base `sgc_test` (ver Tarea 2, Paso 1).

## Review Focus

- Un Director que llama directo a la API sobre un docente de **otra carrera** recibe 404, no 403 ni éxito — Tarea 3 (`gestionar-docentes.spec.ts`).
- Una cuenta con DOCENTE **y otro rol** (Coordinador y Docente a la vez) no aparece en el listado ni se puede inactivar, cambiar ni eliminar desde esta sección — Tarea 3.
- Eliminar un docente que ya tiene una evidencia, una asignatura evaluada o es responsable de una configuración se bloquea y la cuenta sigue existiendo — Tarea 3 (caso de uso) y Tarea 4 (adaptador contra Postgres).
- La contraseña que escribe el Director no sale en ningún evento ni en la respuesta de crear — Tarea 3 (eventos) y Tarea 5 (controlador).
- Un Docente que teclea la URL de Planes de Evaluación o de Criterios sigue rebotando aunque conserve `evaluacion.leer` y `criterio.leer`: menú y ruta usan los permisos `.acceder` — Tarea 6 (menú, con test; la ruta usa el mismo permiso y no tiene test propio porque `App.tsx` usa `BrowserRouter`, deuda ya registrada en el Bloque 1).

---

### Task 1: Matriz de accesos y política de alcance

**Files:**
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts` (catálogo `PERMISOS` y bloques de rol DIRECTOR_CARRERA, COORDINADOR_ACADEMICO, DOCENTE y USUARIO_CONSULTOR)
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts`
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts` (`PERMISOS_ACOTADOS_A_CARRERA`)
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`

**Interfaces:**
- Produces: permisos `docente.gestionar` (módulo `auth`), `evaluacion.acceder` y `criterio.acceder` en el catálogo; `docente.gestionar` en `PERMISOS_ACOTADOS_A_CARRERA`. Tareas 3, 5, 6 y 7 los usan por su código exacto.

- [ ] **Step 1: Escribir los tests de la matriz (fallan)**

En `matriz-de-accesos.spec.ts`:

1. Cambiar el import a `import { PERMISOS, ROLES } from './matriz-de-accesos.js';`.
2. En el array esperado de `DIRECTOR_CARRERA`, añadir `'docente.gestionar',` (el test ordena con `.sort()`, el lugar da igual).
3. En el array esperado de `COORDINADOR_ACADEMICO`, añadir `'criterio.acceder',` y `'evaluacion.acceder',`.
4. **Reemplazar** el test `'DOCENTE y USUARIO_CONSULTOR conservan la entrada al módulo Plan de Estudios'` por estos cuatro tests y el de catálogo, dentro del mismo `describe`:

```ts
  it('USUARIO_CONSULTOR conserva la entrada a Plan de Estudios, Evaluación y Criterios', () => {
    const permisos = permisosOrdenados('USUARIO_CONSULTOR');
    expect(permisos).toContain('plan.acceder');
    expect(permisos).toContain('evaluacion.acceder');
    expect(permisos).toContain('criterio.acceder');
  });

  it('DOCENTE: Planes de Mejora, Mis evidencias y las lecturas que esas pantallas consumen (RF-CH-006)', () => {
    expect(permisosOrdenados('DOCENTE')).toEqual(
      [
        'carrera.leer',
        'competencia.leer',
        'criterio.leer',
        'evaluacion.leer',
        'evidencia.registrar',
        'mejora.leer',
        'objetivo.leer',
      ].sort(),
    );
  });

  it('DOCENTE no tiene ningún permiso que abra un módulo que no es suyo', () => {
    const permisos = permisosOrdenados('DOCENTE');
    for (const ajeno of [
      'plan.acceder',
      'plan.leer',
      'medicion.leer',
      'atributo.leer',
      'actas.leer',
      'evaluacion.acceder',
      'criterio.acceder',
      'reporte.generar',
    ]) {
      expect(permisos).not.toContain(ajeno);
    }
  });

  it('solo el Director tiene docente.gestionar', () => {
    const quienes = ROLES.filter((r) => r.permisos.includes('docente.gestionar')).map(
      (r) => r.codigo,
    );
    expect(quienes).toEqual(['DIRECTOR_CARRERA']);
  });

  it('todo permiso asignado a un rol existe en el catálogo', () => {
    const catalogo = new Set(PERMISOS.map(([codigo]) => codigo));
    const huerfanos = ROLES.flatMap((r) =>
      r.permisos.filter((p) => !catalogo.has(p)).map((p) => `${r.codigo}: ${p}`),
    );
    expect(huerfanos).toEqual([]);
  });
```

En `politica-de-autorizacion.spec.ts`, al final del archivo:

```ts
describe('docente.gestionar', () => {
  const conPermiso: ContextoDeAutorizacion = {
    permisos: new Set(['docente.gestionar']),
    carreraACargo: ISI,
  };

  it('está acotado a una carrera', () => {
    expect(esPermisoAcotadoACarrera('docente.gestionar')).toBe(true);
  });

  it('el director lo ejerce sobre su carrera y no sobre otra', () => {
    expect(puede(conPermiso, 'docente.gestionar', ISI).permitido).toBe(true);
    expect(puede(conPermiso, 'docente.gestionar', IIN).permitido).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/auth/domain`
Expected: FAIL — `DIRECTOR_CARRERA` sin `docente.gestionar`, `COORDINADOR_ACADEMICO` sin los `.acceder`, `DOCENTE` con la lista antigua, `USUARIO_CONSULTOR` sin los `.acceder` y `docente.gestionar` no acotado. El test «todo permiso asignado a un rol existe en el catálogo» ya pasa: es una guarda que fallará si un permiso se asigna a un rol sin declararlo en `PERMISOS`, y protege el Paso 3.

- [ ] **Step 3: Implementar**

En `matriz-de-accesos.ts`, catálogo `PERMISOS`:

- Antes de `['criterio.leer', 'Consultar criterios de acreditación', 'plan-estudios'],` insertar:

```ts
  // Como `plan.acceder`: decide solo si se entra a la sección; `criterio.leer`
  // decide si se pueden leer los datos (el Docente los lee desde Planes de
  // Mejora sin tener la sección).
  ['criterio.acceder', 'Entrar a la sección Criterios de Acreditación', 'plan-estudios'],
```

- Antes de `['evaluacion.leer', 'Consultar planes de evaluación', 'mejora-continua'],` insertar:

```ts
  // Mismo criterio: el Docente lee planes de evaluación desde «Mis evidencias»
  // sin tener el submódulo Planes de Evaluación.
  ['evaluacion.acceder', 'Entrar al submódulo Planes de Evaluación', 'mejora-continua'],
```

- Después de `['rol.gestionar', 'Administrar roles y permisos', 'auth'],` insertar:

```ts
  ['docente.gestionar', 'Gestionar los docentes de su carrera', 'auth'],
```

Roles:

- `DIRECTOR_CARRERA`: añadir `'docente.gestionar',` después de `'auditoria.leer',` (último elemento de su lista).
- `COORDINADOR_ACADEMICO`: añadir `'criterio.acceder',` justo después de `'criterio.leer',` y `'evaluacion.acceder',` justo después de `'evaluacion.leer',`.
- `USUARIO_CONSULTOR`: añadir `'criterio.acceder',` después de `'criterio.leer',` y `'evaluacion.acceder',` después de `'evaluacion.leer',`.
- `DOCENTE`: reemplazar el bloque completo (`descripcion`, comentarios y `permisos`) por:

```ts
    descripcion: 'Trabaja sobre los planes de mejora de su carrera y registra sus evidencias.',
    // RF-CH-006 RN4: Planes de Mejora, «Mis evidencias» y su inicio. Nada más
    // abre un módulo. Lo que sí conserva son las lecturas de datos que esas
    // pantallas consumen (verificado endpoint por endpoint en el Bloque 2):
    // `evaluacion.leer` y `criterio.leer` no abren Planes de Evaluación ni
    // Criterios, porque eso lo deciden `evaluacion.acceder` y `criterio.acceder`.
    permisos: [
      'carrera.leer',
      'objetivo.leer',
      'competencia.leer',
      'criterio.leer',
      'evaluacion.leer',
      'evidencia.registrar',
      'mejora.leer',
    ],
```

En `politica-de-autorizacion.ts`, dentro de `PERMISOS_ACOTADOS_A_CARRERA`, después de `'evidencia.registrar',` añadir:

```ts
  // El Director gestiona a los docentes de su carrera, no los de otra.
  'docente.gestionar',
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/auth/domain`
Expected: PASS (todos los tests del directorio, incluidos los de Bloque 1).

- [ ] **Step 5: Suite completa de la API y typecheck**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS. Si `aislamiento.spec.ts` da timeouts de 5 s, repetir ese spec solo: es carga, no fallo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/domain
git commit -m "feat(auth): permiso docente.gestionar y rol Docente limitado a Planes de Mejora (RF-CH-006)

Añade docente.gestionar (solo Director, acotado a su carrera) y separa
acceder de leer para Evaluación y Criterios con evaluacion.acceder y
criterio.acceder, como plan.acceder en el Bloque 1. El Docente conserva las
lecturas que sus pantallas consumen y pierde los permisos de módulos ajenos."
```

---

### Task 2: Repositorio de usuarios — filtro por carrera y eliminar

**Files:**
- Modify: `apps/api/src/modules/auth/application/ports/gestion-usuarios.port.ts` (`FiltroUsuarios`, `RepositorioGestionUsuariosPort`)
- Modify: `apps/api/src/modules/auth/infrastructure/persistence/gestion-usuarios.repository.ts` (`listar`, `eliminar`)
- Modify: `apps/api/src/modules/auth/application/use-cases/gestionar-usuarios.spec.ts` (el repositorio falso)
- Create: `apps/api/test/integration/gestion-usuarios.int.spec.ts`

**Interfaces:**
- Produces: `FiltroUsuarios.carreraId?: string`; `RepositorioGestionUsuariosPort.eliminar(id: string): Promise<void>`. La Tarea 3 los consume.

- [ ] **Step 1: Preparar una base desechable (una sola vez)**

La base de desarrollo **no** sirve: los tests de integración hacen `TRUNCATE`. Crear `sgc_test`:

```bash
docker exec sgc_postgres psql -U <usuario-de-la-base> -c "CREATE DATABASE sgc_test"
```

`<usuario-de-la-base>` y la contraseña están en `infra/docker/docker-compose.yml`. La URL de la base desechable es la de `apps/api/.env` cambiando el nombre de la base por `sgc_test`. Exportarla solo en esta terminal y preparar el esquema y el catálogo:

```bash
cd apps/api
export DATABASE_URL='<url con /sgc_test>'
npx prisma migrate deploy
npm run db:seed
```

Expected: migraciones aplicadas y «Listo. No se creó ningún usuario…» del seed. Todos los comandos `test:integration` de este plan se ejecutan en esta misma terminal, con `DATABASE_URL` apuntando a `sgc_test` (el nombre `sgc_test` es el que `exigir-base-desechable.ts` acepta sin más variables).

- [ ] **Step 2: Escribir el test de integración (falla)**

Crear `apps/api/test/integration/gestion-usuarios.int.spec.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { GestionUsuariosRepositoryPrisma } from '../../src/modules/auth/infrastructure/persistence/gestion-usuarios.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new GestionUsuariosRepositoryPrisma(prisma);

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

async function crearUsuario(email: string, codigoRol: string, carreraId: string | null) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('listar con filtro por carrera', () => {
  it('trae solo las cuentas de esa carrera con ese rol', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await crearUsuario('doc-sis@x.pe', 'DOCENTE', sis);
    await crearUsuario('doc-civ@x.pe', 'DOCENTE', civ);
    await crearUsuario('dir-sis@x.pe', 'DIRECTOR_CARRERA', sis);

    const r = await repo.listar({ rol: 'DOCENTE', carreraId: sis });

    expect(r.map((u) => u.email)).toEqual(['doc-sis@x.pe']);
  });

  it('sin carreraId no filtra por carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    await crearUsuario('a@x.pe', 'DOCENTE', sis);
    await crearUsuario('b@x.pe', 'DOCENTE', civ);

    const r = await repo.listar({ rol: 'DOCENTE' });

    expect(r).toHaveLength(2);
  });
});

describe('eliminar', () => {
  it('borra la cuenta y, en cascada, sus roles, su carrera y sus sesiones', async () => {
    const sis = await crearCarrera('SIS');
    const doc = await crearUsuario('doc@x.pe', 'DOCENTE', sis);
    await prisma.refreshToken.create({
      data: {
        usuarioId: doc.id,
        tokenHash: 'h',
        expiraEn: new Date('2030-01-01'),
      },
    });

    await repo.eliminar(doc.id);

    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.usuarioRol.count()).toBe(0);
    expect(await prisma.usuarioCarrera.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('no toca a las demás cuentas', async () => {
    const sis = await crearCarrera('SIS');
    const uno = await crearUsuario('uno@x.pe', 'DOCENTE', sis);
    await crearUsuario('dos@x.pe', 'DOCENTE', sis);

    await repo.eliminar(uno.id);

    expect((await prisma.usuario.findMany()).map((u) => u.email)).toEqual(['dos@x.pe']);
  });
});
```

Antes de continuar, comprobar que `RefreshToken` tiene exactamente esos campos obligatorios: `rg -n "^model RefreshToken" -A 14 apps/api/prisma/schema.prisma`. Si el modelo pide otros campos obligatorios (por ejemplo `familia`), añadirlos a la llamada `refreshToken.create` del test y volver a este paso.

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd apps/api && npm run test:integration -- gestion-usuarios`
Expected: FAIL — `repo.eliminar is not a function` y el primer test devolviendo docentes de las dos carreras (el filtro `carreraId` no existe todavía).

- [ ] **Step 4: Implementar**

En `gestion-usuarios.port.ts`:

- En `FiltroUsuarios`, después de `readonly rol?: string;`:

```ts
  /** Solo las cuentas asignadas a esa carrera. */
  readonly carreraId?: string;
```

- En `RepositorioGestionUsuariosPort`, después de `cambiarPassword(...)`:

```ts
  /**
   * Borra la cuenta. Sus filas de `usuario_rol`, `usuario_carrera` y
   * `refresh_tokens` se van por `ON DELETE CASCADE`. Los demás módulos guardan
   * el id sin clave foránea: quien llame decide antes si pueden quedar huérfanos
   * (ver `DocenteEnUsoPort`).
   */
  eliminar(id: string): Promise<void>;
```

En `gestion-usuarios.repository.ts`:

- En `listar`, dentro del `where`, después de la línea del filtro `rol`:

```ts
        ...(filtro.carreraId ? { carreras: { some: { carreraId: filtro.carreraId } } } : {}),
```

- Después de `cambiarPassword(...)`:

```ts
  async eliminar(id: string): Promise<void> {
    await this.prisma.usuario.delete({ where: { id } });
  }
```

En `gestionar-usuarios.spec.ts`, en el objeto `repo`, después de `cambiarEstado: async (_id, activo) => usuario({ activo }),` añadir `eliminar: async () => undefined,`.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run test:integration -- gestion-usuarios && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; `tsc` sin errores (si lista otro repositorio falso del puerto, añadirle `eliminar: async () => undefined,`).

- [ ] **Step 6: Suite unitaria y commit**

Run: `cd apps/api && npx vitest run`
Expected: PASS.

```bash
git add apps/api/src/modules/auth apps/api/test/integration/gestion-usuarios.int.spec.ts
git commit -m "feat(auth): el repositorio de usuarios filtra por carrera y puede eliminar cuentas"
```

---

### Task 3: Puerto `DocenteEnUsoPort`, eventos y caso de uso `GestionarDocentes`

**Files:**
- Create: `apps/api/src/modules/auth/application/ports/docente-en-uso.port.ts`
- Modify: `apps/api/src/modules/auth/domain/events/eventos-usuario.ts`
- Create: `apps/api/src/modules/auth/application/use-cases/gestionar-docentes.use-case.ts`
- Test: `apps/api/src/modules/auth/application/use-cases/gestionar-docentes.spec.ts`

**Interfaces:**
- Consumes (Tarea 2): `FiltroUsuarios.carreraId`, `RepositorioGestionUsuariosPort.eliminar`. Consumes (Tarea 1): el permiso `docente.gestionar`.
- Produces:
  - `DocenteEnUsoPort.enUso(docenteId: string): Promise<UsoDeDocente>` con `UsoDeDocente = { readonly enUso: boolean; readonly motivos: readonly string[] }`, y el token `DOCENTE_EN_USO`.
  - `class GestionarDocentes` con `constructor(usuarios: RepositorioGestionUsuariosPort, seguridad: SeguridadPort, autorizacion: AuthorizationPort, enUso: DocenteEnUsoPort, eventos: PublicadorDeEventos)` y los métodos `listar(actor): Promise<DatosUsuario[]>`, `crear(actor, datos: DatosNuevoDocente): Promise<DatosUsuario>`, `cambiarPassword(actor, id, password): Promise<void>`, `cambiarEstado(actor, id, activo): Promise<DatosUsuario>`, `eliminar(actor, id): Promise<void>`.
  - `interface DatosNuevoDocente { readonly nombreCompleto: string; readonly email: string; readonly password: string }`.
  - Eventos `DocenteCreado`, `PasswordDeDocenteCambiada`, `DocenteInactivado`, `DocenteReactivado`, `DocenteEliminado`, todos `(actor: Actor, entidadId: string, email: string)`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `apps/api/src/modules/auth/application/use-cases/gestionar-docentes.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Actor, DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../ports/authorization.port.js';
import type { DocenteEnUsoPort, UsoDeDocente } from '../ports/docente-en-uso.port.js';
import type {
  DatosUsuario,
  FiltroUsuarios,
  RepositorioGestionUsuariosPort,
} from '../ports/gestion-usuarios.port.js';
import type { SeguridadPort } from '../ports/sesion.port.js';
import { GestionarDocentes } from './gestionar-docentes.use-case.js';

const DIRECTOR: Actor = { id: 'dir-1', nombre: 'Rosa Vidal' };
const ISI = 'carrera-isi';
const IIN = 'carrera-iin';

function docente(sobre: Partial<DatosUsuario> = {}): DatosUsuario {
  return {
    id: 'doc-1',
    email: 'luis@sgc.local',
    nombreCompleto: 'Luis Ramos',
    activo: true,
    roles: [{ codigo: 'DOCENTE', nombre: 'Docente' }],
    carreraId: ISI,
    creadoEn: new Date('2026-01-01'),
    ultimaActividad: null,
    ...sobre,
  };
}

const COORDINADOR_Y_DOCENTE = [
  { codigo: 'DOCENTE', nombre: 'Docente' },
  { codigo: 'COORDINADOR_ACADEMICO', nombre: 'Coordinador académico' },
];

function montar(
  opciones: {
    existente?: DatosUsuario | null;
    carreraDelDirector?: string | null;
    permitido?: boolean;
    tienePermiso?: boolean;
    emailDuplicado?: boolean;
    uso?: UsoDeDocente;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const filtros: FiltroUsuarios[] = [];
  const creados: unknown[] = [];
  const passwords: { id: string; hash: string }[] = [];
  const estados: { id: string; activo: boolean }[] = [];
  const eliminados: string[] = [];

  // Solo lo que este caso de uso toca del repositorio.
  const repo = {
    listar: async (filtro: FiltroUsuarios) => {
      filtros.push(filtro);
      return [docente(), docente({ id: 'otro-rol', roles: COORDINADOR_Y_DOCENTE })];
    },
    porId: async () => (opciones.existente === undefined ? docente() : opciones.existente),
    existeEmail: async () => opciones.emailDuplicado ?? false,
    crear: async (datos: { email: string; nombreCompleto: string; carreraId: string | null }) => {
      creados.push(datos);
      return docente({
        id: 'nuevo',
        email: datos.email,
        nombreCompleto: datos.nombreCompleto,
        carreraId: datos.carreraId,
      });
    },
    cambiarEstado: async (id: string, activo: boolean) => {
      estados.push({ id, activo });
      return docente({ activo });
    },
    cambiarPassword: async (id: string, hash: string) => void passwords.push({ id, hash }),
    eliminar: async (id: string) => void eliminados.push(id),
  } as unknown as RepositorioGestionUsuariosPort;

  const seguridad = {
    hashearPassword: async (p: string) => `hash-de-${p}`,
  } as unknown as SeguridadPort;

  const autorizacion = {
    carreraACargoDe: async () =>
      opciones.carreraDelDirector === undefined ? ISI : opciones.carreraDelDirector,
    permisosDe: async () => new Set(opciones.tienePermiso === false ? [] : ['docente.gestionar']),
    puede: async () =>
      (opciones.permitido ?? true)
        ? { permitido: true as const }
        : { permitido: false as const, motivo: 'Falta el permiso docente.gestionar.' },
  } as unknown as AuthorizationPort;

  const enUso: DocenteEnUsoPort = {
    enUso: async () => opciones.uso ?? { enUso: false, motivos: [] },
  };

  const caso = new GestionarDocentes(repo, seguridad, autorizacion, enUso, {
    publicar: async (e) => void publicados.push(...e),
  });

  return { caso, publicados, filtros, creados, passwords, estados, eliminados };
}

describe('listar', () => {
  it('pide los docentes de la carrera del Director y descarta cuentas con más de un rol', async () => {
    const { caso, filtros } = montar();

    const r = await caso.listar(DIRECTOR);

    expect(filtros).toEqual([{ rol: 'DOCENTE', carreraId: ISI }]);
    expect(r.map((d) => d.id)).toEqual(['doc-1']);
  });

  it('sin el permiso docente.gestionar es AccesoDenegado', async () => {
    const { caso } = montar({ permitido: false });
    await expect(caso.listar(DIRECTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('con el permiso pero sin carrera asignada explica qué falta', async () => {
    const { caso } = montar({ carreraDelDirector: null });
    await expect(caso.listar(DIRECTOR)).rejects.toThrow(/carrera asignada/);
  });

  it('sin permiso y sin carrera es AccesoDenegado, no un aviso de carrera', async () => {
    const { caso } = montar({ carreraDelDirector: null, tienePermiso: false });
    await expect(caso.listar(DIRECTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('crear (RF-CH-011 y RF-CH-012)', () => {
  const datos = {
    nombreCompleto: '  Nuevo Docente ',
    email: ' Nuevo@SGC.local ',
    password: 'Clave.Docente.1',
  };

  it('asocia al docente a la carrera del Director, con el rol DOCENTE y el correo normalizado', async () => {
    const { caso, creados } = montar();

    const r = await caso.crear(DIRECTOR, datos);

    expect(creados).toEqual([
      {
        email: 'nuevo@sgc.local',
        nombreCompleto: 'Nuevo Docente',
        rolCodigos: ['DOCENTE'],
        carreraId: ISI,
        passwordHash: 'hash-de-Clave.Docente.1',
      },
    ]);
    expect(r.email).toBe('nuevo@sgc.local');
  });

  it('publica DocenteCreado y la contraseña no aparece en ningún evento', async () => {
    const { caso, publicados } = montar();

    await caso.crear(DIRECTOR, datos);

    expect(publicados.map((e) => e.nombre)).toEqual(['docente.creado']);
    expect(JSON.stringify(publicados)).not.toContain('Clave.Docente.1');
  });

  it('rechaza un usuario que ya existe', async () => {
    const { caso, creados } = montar({ emailDuplicado: true });
    await expect(caso.crear(DIRECTOR, datos)).rejects.toThrow(/nuevo@sgc.local/);
    expect(creados).toEqual([]);
  });

  it('exige nombre, usuario y contraseña', async () => {
    const { caso } = montar();
    await expect(caso.crear(DIRECTOR, { ...datos, nombreCompleto: '   ' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    await expect(caso.crear(DIRECTOR, { ...datos, email: '' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    await expect(caso.crear(DIRECTOR, { ...datos, password: '' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
  });

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const { caso, creados } = montar();
    await expect(caso.crear(DIRECTOR, { ...datos, password: '1234567' })).rejects.toThrow(
      /al menos 8 caracteres/,
    );
    expect(creados).toEqual([]);
  });
});

describe('cambiarPassword (RF-CH-013)', () => {
  it('guarda el hash de la nueva contraseña y deja constancia sin ella', async () => {
    const { caso, passwords, publicados } = montar();

    await caso.cambiarPassword(DIRECTOR, 'doc-1', 'Otra.Clave.Docente.2');

    expect(passwords).toEqual([{ id: 'doc-1', hash: 'hash-de-Otra.Clave.Docente.2' }]);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.password_cambiada']);
    expect(JSON.stringify(publicados)).not.toContain('Otra.Clave.Docente.2');
  });

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const { caso, passwords } = montar();
    await expect(caso.cambiarPassword(DIRECTOR, 'doc-1', 'corta')).rejects.toThrow(
      /al menos 8 caracteres/,
    );
    expect(passwords).toEqual([]);
  });
});

describe('solo se gestionan los docentes de la propia carrera', () => {
  it('un docente de otra carrera responde NoEncontrado en todas las operaciones', async () => {
    const { caso, passwords, estados, eliminados } = montar({
      existente: docente({ carreraId: IIN }),
    });

    await expect(caso.cambiarPassword(DIRECTOR, 'doc-1', 'Clave.Docente.1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    await expect(caso.cambiarEstado(DIRECTOR, 'doc-1', false)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.eliminar(DIRECTOR, 'doc-1')).rejects.toBeInstanceOf(NoEncontrado);

    expect([passwords, estados, eliminados]).toEqual([[], [], []]);
  });

  it('una cuenta con DOCENTE y otro rol no se puede tocar desde aquí', async () => {
    const { caso, eliminados } = montar({ existente: docente({ roles: COORDINADOR_Y_DOCENTE }) });

    await expect(caso.eliminar(DIRECTOR, 'doc-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(eliminados).toEqual([]);
  });

  it('un id que no existe responde NoEncontrado', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.eliminar(DIRECTOR, 'nadie')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('inactivar y reactivar (RF-CH-014)', () => {
  it('inactivar cambia el estado y publica DocenteInactivado', async () => {
    const { caso, estados, publicados } = montar();

    const r = await caso.cambiarEstado(DIRECTOR, 'doc-1', false);

    expect(estados).toEqual([{ id: 'doc-1', activo: false }]);
    expect(r.activo).toBe(false);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.inactivado']);
  });

  it('reactivar publica DocenteReactivado', async () => {
    const { caso, estados, publicados } = montar({ existente: docente({ activo: false }) });

    await caso.cambiarEstado(DIRECTOR, 'doc-1', true);

    expect(estados).toEqual([{ id: 'doc-1', activo: true }]);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.reactivado']);
  });
});

describe('eliminar (RF-CH-014)', () => {
  it('sin referencias en otros módulos, borra la cuenta y publica DocenteEliminado', async () => {
    const { caso, eliminados, publicados } = montar();

    await caso.eliminar(DIRECTOR, 'doc-1');

    expect(eliminados).toEqual(['doc-1']);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.eliminado']);
  });

  it('en uso, bloquea el borrado, dice por qué y sugiere inactivar', async () => {
    const { caso, eliminados, publicados } = montar({
      uso: { enUso: true, motivos: ['tiene 2 evidencia(s) registrada(s)'] },
    });

    await expect(caso.eliminar(DIRECTOR, 'doc-1')).rejects.toThrow(
      /Luis Ramos.*2 evidencia\(s\) registrada\(s\).*Inactívalo/s,
    );
    expect(eliminados).toEqual([]);
    expect(publicados).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/auth/application/use-cases/gestionar-docentes.spec.ts`
Expected: FAIL — no se puede resolver `./gestionar-docentes.use-case.js` ni `../ports/docente-en-uso.port.js`.

- [ ] **Step 3: Implementar el puerto, los eventos y el caso de uso**

Crear `apps/api/src/modules/auth/application/ports/docente-en-uso.port.ts`:

```ts
/**
 * ¿Otro módulo todavía referencia a este docente?
 *
 * Los módulos de Mejora Continua guardan el id de un docente sin clave foránea,
 * a propósito, para que el registro siga legible si la cuenta desaparece
 * (§3.2 prohíbe compartir tablas). Por eso borrar una cuenta no puede apoyarse
 * en la base: `auth` pregunta por este puerto y cada módulo que guarda ese id
 * responde por lo suyo.
 */

export interface UsoDeDocente {
  readonly enUso: boolean;
  /** Frases listas para mostrar, p. ej. «tiene 2 evidencia(s) registrada(s)». */
  readonly motivos: readonly string[];
}

export interface DocenteEnUsoPort {
  enUso(docenteId: string): Promise<UsoDeDocente>;
}

export const DOCENTE_EN_USO = Symbol('DocenteEnUsoPort');
```

Añadir al final de `apps/api/src/modules/auth/domain/events/eventos-usuario.ts`:

```ts
/* ── Docentes gestionados por el Director de carrera (RF-CH-010 a 014) ──────
 * Ninguno lleva la contraseña ni su hash, por la misma razón que los de arriba.
 */

export class DocenteCreado extends DomainEvent {
  readonly nombre = 'docente.creado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} registrado por el Director de carrera.`;
  }
}

export class PasswordDeDocenteCambiada extends DomainEvent {
  readonly nombre = 'docente.password_cambiada';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle =
      `Contraseña del docente ${email} cambiada por el Director de carrera. ` +
      'Se revocaron sus sesiones abiertas.';
  }
}

export class DocenteInactivado extends DomainEvent {
  readonly nombre = 'docente.inactivado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} inactivado: ya no puede iniciar sesión ni ser elegido como responsable.`;
  }
}

export class DocenteReactivado extends DomainEvent {
  readonly nombre = 'docente.reactivado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} reactivado.`;
  }
}

export class DocenteEliminado extends DomainEvent {
  readonly nombre = 'docente.eliminado';
  readonly entidad = 'Usuario' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    email: string,
  ) {
    super(actor);
    this.detalle = `Docente ${email} eliminado. Ningún registro de otro módulo lo referenciaba.`;
  }
}
```

Crear `apps/api/src/modules/auth/application/use-cases/gestionar-docentes.use-case.ts`:

```ts
/**
 * El Director de carrera gestiona a los docentes de su carrera (permiso
 * `docente.gestionar`, RF-CH-010 a 014).
 *
 * Tres reglas sostienen el resto:
 *
 *  1. **Siempre la carrera del Director.** La carrera sale de la sesión, nunca
 *     de un parámetro: no hay forma de crear, ver ni tocar un docente ajeno.
 *  2. **Solo cuentas cuyo único rol es DOCENTE.** Una cuenta con Docente y
 *     Coordinador a la vez no es «un docente de mi carrera»: es una persona con
 *     otra responsabilidad, y borrarla desde aquí se llevaría esa también.
 *  3. **Eliminar exige que nadie la referencie.** Lo pregunta `DocenteEnUsoPort`;
 *     si la usan, se sugiere inactivar, que conserva el historial.
 *
 * Un docente de otra carrera responde `NoEncontrado` y no `AccesoDenegado`: no
 * se revela que existe.
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
import {
  DocenteCreado,
  DocenteEliminado,
  DocenteInactivado,
  DocenteReactivado,
  PasswordDeDocenteCambiada,
} from '../../domain/events/eventos-usuario.js';
import type { AuthorizationPort } from '../ports/authorization.port.js';
import type { DocenteEnUsoPort } from '../ports/docente-en-uso.port.js';
import type {
  DatosUsuario,
  RepositorioGestionUsuariosPort,
} from '../ports/gestion-usuarios.port.js';
import type { SeguridadPort } from '../ports/sesion.port.js';

const ROL_DOCENTE = 'DOCENTE';
const PERMISO = 'docente.gestionar';
const LARGO_MINIMO_PASSWORD = 8;

export interface DatosNuevoDocente {
  readonly nombreCompleto: string;
  readonly email: string;
  readonly password: string;
}

export class GestionarDocentes {
  constructor(
    private readonly usuarios: RepositorioGestionUsuariosPort,
    private readonly seguridad: SeguridadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly enUso: DocenteEnUsoPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async listar(actor: Actor): Promise<DatosUsuario[]> {
    const carreraId = await this.carreraDe(actor);
    const cuentas = await this.usuarios.listar({ rol: ROL_DOCENTE, carreraId });
    return cuentas.filter(esSoloDocente);
  }

  async crear(actor: Actor, datos: DatosNuevoDocente): Promise<DatosUsuario> {
    const carreraId = await this.carreraDe(actor);

    const nombreCompleto = datos.nombreCompleto.trim();
    const email = datos.email.trim().toLowerCase();
    if (!nombreCompleto || !email || !datos.password) {
      throw new ReglaDeNegocioViolada('El nombre completo, el usuario y la contraseña son obligatorios.');
    }
    validarPassword(datos.password);

    if (await this.usuarios.existeEmail(email)) {
      throw new ReglaDeNegocioViolada(`Ya existe una cuenta con el usuario ${email}.`);
    }

    const docente = await this.usuarios.crear({
      email,
      nombreCompleto,
      rolCodigos: [ROL_DOCENTE],
      carreraId,
      passwordHash: await this.seguridad.hashearPassword(datos.password),
    });

    await this.eventos.publicar([new DocenteCreado(actor, docente.id, docente.email)]);
    return docente;
  }

  async cambiarPassword(actor: Actor, id: string, password: string): Promise<void> {
    const docente = await this.delaCarrera(actor, id);
    validarPassword(password);

    await this.usuarios.cambiarPassword(id, await this.seguridad.hashearPassword(password));
    await this.eventos.publicar([new PasswordDeDocenteCambiada(actor, id, docente.email)]);
  }

  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosUsuario> {
    const docente = await this.delaCarrera(actor, id);

    const cambiado = await this.usuarios.cambiarEstado(id, activo);
    await this.eventos.publicar([
      activo
        ? new DocenteReactivado(actor, id, docente.email)
        : new DocenteInactivado(actor, id, docente.email),
    ]);
    return cambiado;
  }

  async eliminar(actor: Actor, id: string): Promise<void> {
    const docente = await this.delaCarrera(actor, id);

    const uso = await this.enUso.enUso(id);
    if (uso.enUso) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar a ${docente.nombreCompleto}: ${uso.motivos.join('; ')}. ` +
          'Inactívalo en su lugar: conserva su historial y deja de estar disponible.',
      );
    }

    await this.usuarios.eliminar(id);
    await this.eventos.publicar([new DocenteEliminado(actor, id, docente.email)]);
  }

  /**
   * La carrera del Director, comprobando antes el permiso.
   *
   * Sin carrera hay que distinguir dos casos: quien no tiene ni el permiso recibe
   * `AccesoDenegado` (no se le explica qué le falta de su carrera); quien sí lo
   * tiene recibe el aviso de que necesita una carrera asignada.
   */
  private async carreraDe(actor: Actor): Promise<string> {
    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);

    if (carreraId === null) {
      const permisos = await this.autorizacion.permisosDe(actor.id);
      if (!permisos.has(PERMISO)) throw new AccesoDenegado(`Falta el permiso ${PERMISO}.`);
      throw new ReglaDeNegocioViolada('Necesitas una carrera asignada para gestionar docentes.');
    }

    const decision = await this.autorizacion.puede(actor.id, PERMISO, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
    return carreraId;
  }

  private async delaCarrera(actor: Actor, id: string): Promise<DatosUsuario> {
    const carreraId = await this.carreraDe(actor);
    const docente = await this.usuarios.porId(id);
    if (!docente || docente.carreraId !== carreraId || !esSoloDocente(docente)) {
      throw new NoEncontrado('el docente', id);
    }
    return docente;
  }
}

function esSoloDocente(cuenta: DatosUsuario): boolean {
  return cuenta.roles.length === 1 && cuenta.roles[0]?.codigo === ROL_DOCENTE;
}

function validarPassword(password: string): void {
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw new ReglaDeNegocioViolada(
      `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
    );
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/auth/application/use-cases/gestionar-docentes.spec.ts`
Expected: PASS (los 18 tests).

- [ ] **Step 5: Typecheck, suite y prettier**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx prettier --write src/modules/auth`
Expected: PASS; prettier puede reformatear la línea larga del `throw` de `crear`. Revisar con `git diff --stat` que solo cambien los archivos de esta tarea.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(auth): GestionarDocentes — alta, contraseña, inactivar, reactivar y eliminar (RF-CH-010 a 014)

El Director gestiona solo cuentas cuyo único rol es DOCENTE en su carrera.
Eliminar consulta DocenteEnUsoPort y, si lo usan, sugiere inactivar."
```

---

### Task 4: Adaptador `DocenteEnUsoAdapter` en `mejora-continua`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/docente-en-uso.adapter.ts`
- Test: `apps/api/test/integration/docente-en-uso.int.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts` (lista `permitidos` de la regla de `auth`)

**Interfaces:**
- Consumes (Tarea 3): `DocenteEnUsoPort`, `UsoDeDocente` de `auth/application/ports/docente-en-uso.port.js`.
- Produces: `class DocenteEnUsoAdapter implements DocenteEnUsoPort` con `constructor(prisma: PrismaService)`. La Tarea 5 lo registra bajo el token `DOCENTE_EN_USO`.

- [ ] **Step 1: Escribir el test de integración (falla)**

Crear `apps/api/test/integration/docente-en-uso.int.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DocenteEnUsoAdapter } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/docente-en-uso.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new DocenteEnUsoAdapter(prisma);

const DOCENTE = randomUUID();
const OTRO = randomUUID();

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Un plan de evaluación con su cruce competencia × periodo, listo para colgarle filas. */
async function planDeEvaluacion() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Sistemas',
      codigo: `C${randomUUID().slice(0, 6)}`,
      duracionAnios: 5,
    },
  });
  const planEstudios = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  const medicion = await prisma.planMedicion.create({
    data: {
      planEstudiosId: planEstudios.id,
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
      estado: 'BORRADOR',
    },
  });
  const competenciaId = randomUUID();
  const cruce = await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: plan.id, competenciaId, periodoId: periodo.id },
  });
  return { plan, cruce, competenciaId };
}

async function asignaturaEvaluada(medicionAlcanzadaId: string, docenteId: string | null) {
  return prisma.asignaturaEvaluada.create({
    data: {
      medicionAlcanzadaId,
      asignaturaId: randomUUID(),
      entregable: 'Proyecto final',
      docenteId,
    },
  });
}

describe('DocenteEnUsoAdapter.enUso', () => {
  it('un docente sin ninguna referencia no está en uso', async () => {
    const { cruce } = await planDeEvaluacion();
    await asignaturaEvaluada(cruce.id, OTRO);

    expect(await adaptador.enUso(DOCENTE)).toEqual({ enUso: false, motivos: [] });
  });

  it('asignado como docente de una asignatura evaluada', async () => {
    const { cruce } = await planDeEvaluacion();
    await asignaturaEvaluada(cruce.id, DOCENTE);
    await asignaturaEvaluada(cruce.id, DOCENTE);

    const r = await adaptador.enUso(DOCENTE);

    expect(r.enUso).toBe(true);
    expect(r.motivos).toEqual(['tiene 2 asignatura(s) asignada(s) en planes de evaluación']);
  });

  it('responsable de la configuración de una competencia', async () => {
    const { plan, competenciaId } = await planDeEvaluacion();
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId, responsableId: DOCENTE },
    });

    const r = await adaptador.enUso(DOCENTE);

    expect(r.enUso).toBe(true);
    expect(r.motivos).toEqual(['es responsable de 1 configuración(es) de evaluación']);
  });

  it('autor de una evidencia', async () => {
    const { cruce } = await planDeEvaluacion();
    const ae = await asignaturaEvaluada(cruce.id, OTRO);
    await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: ae.id,
        enlace: 'https://x',
        descripcion: 'Rúbrica',
        registradaPorId: DOCENTE,
      },
    });

    const r = await adaptador.enUso(DOCENTE);

    expect(r.enUso).toBe(true);
    expect(r.motivos).toEqual(['tiene 1 evidencia(s) registrada(s)']);
  });

  it('suma todos los motivos cuando hay varios', async () => {
    const { plan, cruce, competenciaId } = await planDeEvaluacion();
    const ae = await asignaturaEvaluada(cruce.id, DOCENTE);
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: plan.id, competenciaId, responsableId: DOCENTE },
    });
    await prisma.evidencia.create({
      data: {
        asignaturaEvaluadaId: ae.id,
        enlace: 'https://x',
        descripcion: 'Rúbrica',
        registradaPorId: DOCENTE,
      },
    });

    const r = await adaptador.enUso(DOCENTE);

    expect(r.motivos).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && npm run test:integration -- docente-en-uso`
Expected: FAIL — no se puede resolver `docente-en-uso.adapter.js`. (Terminal con `DATABASE_URL` de `sgc_test`, ver Tarea 2, Paso 1.)

- [ ] **Step 3: Implementar el adaptador**

Crear `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/docente-en-uso.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  DocenteEnUsoPort,
  UsoDeDocente,
} from '../../../../auth/application/ports/docente-en-uso.port.js';

/**
 * Las tres tablas de Mejora Continua que guardan el id de un docente sin clave
 * foránea, para que `auth` sepa si puede borrar una cuenta (RF-CH-014).
 *
 * Cuando exista la responsabilidad de acciones de mejora sobre un docente
 * registrado (bloque de Mejora Continua), su tabla se añade aquí.
 */
@Injectable()
export class DocenteEnUsoAdapter implements DocenteEnUsoPort {
  constructor(private readonly prisma: PrismaService) {}

  async enUso(docenteId: string): Promise<UsoDeDocente> {
    const [asignaturas, configuraciones, evidencias] = await Promise.all([
      this.prisma.asignaturaEvaluada.count({ where: { docenteId } }),
      this.prisma.configuracionCompetencia.count({ where: { responsableId: docenteId } }),
      this.prisma.evidencia.count({ where: { registradaPorId: docenteId } }),
    ]);

    const motivos: string[] = [];
    if (asignaturas > 0) {
      motivos.push(`tiene ${asignaturas} asignatura(s) asignada(s) en planes de evaluación`);
    }
    if (configuraciones > 0) {
      motivos.push(`es responsable de ${configuraciones} configuración(es) de evaluación`);
    }
    if (evidencias > 0) {
      motivos.push(`tiene ${evidencias} evidencia(s) registrada(s)`);
    }

    return { enUso: motivos.length > 0, motivos };
  }
}
```

- [ ] **Step 4: Ejecutar el test de integración y ver que pasa**

Run: `cd apps/api && npm run test:integration -- docente-en-uso`
Expected: PASS (5 tests).

- [ ] **Step 5: Ver que el aislamiento de módulos ahora falla, y permitir solo este puerto**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/aislamiento.spec.ts`
Expected: FAIL en «de auth solo importa lo que auth expone» — el adaptador importa `auth/application/ports/docente-en-uso.port.js`, que no está en la lista.

En `aislamiento.spec.ts`, dentro de `permitidos` de ese test, después de `'ports/directorio-usuarios.port.js',` añadir:

```ts
      // Puerto que `auth` define para preguntar si un docente está en uso
      // (RF-CH-014). Mejora Continua lo implementa con sus propias tablas.
      'ports/docente-en-uso.port.js',
```

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/aislamiento.spec.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

```bash
git add apps/api/src/modules/mejora-continua apps/api/test/integration/docente-en-uso.int.spec.ts
git commit -m "feat(mejora-continua): DocenteEnUsoAdapter — qué referencias impiden borrar a un docente (RF-CH-014)"
```

---

### Task 5: Endpoints `/carrera/docentes` y cableado

**Files:**
- Create: `apps/api/src/modules/auth/infrastructure/http/dto/docentes.dto.ts`
- Test: `apps/api/src/modules/auth/infrastructure/http/dto/docentes.dto.spec.ts`
- Create: `apps/api/src/modules/auth/infrastructure/http/docentes-de-carrera.controller.ts`
- Test: `apps/api/src/modules/auth/infrastructure/http/docentes-de-carrera.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes (Tareas 3 y 4): `GestionarDocentes`, `DOCENTE_EN_USO`, `DocenteEnUsoAdapter`.
- Produces: `POST /carrera/docentes` (201, cuerpo `{ nombreCompleto, email, password }`, devuelve `DocenteDto`), `GET /carrera/docentes` (`DocenteDto[]`), `PATCH /carrera/docentes/:id/password` (cuerpo `{ password }`, 204), `PATCH /carrera/docentes/:id/estado` (cuerpo `{ activo }`, `DocenteDto`), `DELETE /carrera/docentes/:id` (204). `DocenteDto = { id, email, nombreCompleto, activo, creadoEn }`. Las Tareas 7 y 8 usan estas rutas.

- [ ] **Step 1: Escribir los tests de los DTO (fallan)**

Crear `apps/api/src/modules/auth/infrastructure/http/dto/docentes.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  CambiarEstadoDocenteDto,
  CambiarPasswordDocenteDto,
  CrearDocenteDto,
} from './docentes.dto.js';

async function errores<T extends object>(clase: new () => T, datos: object): Promise<string[]> {
  const fallos = await validate(plainToInstance(clase, datos));
  return fallos.flatMap((f) => Object.values(f.constraints ?? {}));
}

const valido = {
  nombreCompleto: 'Luis Ramos',
  email: 'luis@sgc.local',
  password: 'Clave.Docente.1',
};

describe('CrearDocenteDto', () => {
  it('acepta los datos completos', async () => {
    expect(await errores(CrearDocenteDto, valido)).toEqual([]);
  });

  it('rechaza un usuario que no es un correo', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, email: 'luis' })).toEqual([
      'El usuario debe ser un correo con formato válido.',
    ]);
  });

  it('rechaza un nombre en blanco, midiéndolo ya recortado', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, nombreCompleto: '    ' })).toEqual([
      'El nombre debe tener entre 3 y 200 caracteres.',
    ]);
  });

  it('rechaza una contraseña de 7 caracteres', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, password: '1234567' })).toEqual([
      'La contraseña debe tener al menos 8 caracteres.',
    ]);
  });

  it('rechaza una contraseña de más de 128 caracteres', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, password: 'a'.repeat(129) })).toEqual([
      'La contraseña no puede pasar de 128 caracteres.',
    ]);
  });
});

describe('CambiarPasswordDocenteDto', () => {
  it('acepta 8 caracteres y rechaza 7', async () => {
    expect(await errores(CambiarPasswordDocenteDto, { password: '12345678' })).toEqual([]);
    expect(await errores(CambiarPasswordDocenteDto, { password: '1234567' })).toHaveLength(1);
  });
});

describe('CambiarEstadoDocenteDto', () => {
  it('exige un booleano', async () => {
    expect(await errores(CambiarEstadoDocenteDto, { activo: false })).toEqual([]);
    expect(await errores(CambiarEstadoDocenteDto, { activo: 'no' })).toHaveLength(1);
  });
});
```

Crear `apps/api/src/modules/auth/infrastructure/http/docentes-de-carrera.controller.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import type { DatosUsuario } from '../../application/ports/gestion-usuarios.port.js';
import type { GestionarDocentes } from '../../application/use-cases/gestionar-docentes.use-case.js';
import { aDocenteDto, DocentesDeCarreraController } from './docentes-de-carrera.controller.js';

const ACTOR: Actor = { id: 'dir-1', nombre: 'Rosa Vidal' };

const cuenta: DatosUsuario = {
  id: 'doc-1',
  email: 'luis@sgc.local',
  nombreCompleto: 'Luis Ramos',
  activo: true,
  roles: [{ codigo: 'DOCENTE', nombre: 'Docente' }],
  carreraId: 'carrera-isi',
  creadoEn: new Date('2026-01-01'),
  ultimaActividad: null,
};

describe('aDocenteDto', () => {
  it('expone solo lo que la pantalla necesita, sin roles ni carrera ni credenciales', () => {
    expect(aDocenteDto(cuenta)).toEqual({
      id: 'doc-1',
      email: 'luis@sgc.local',
      nombreCompleto: 'Luis Ramos',
      activo: true,
      creadoEn: new Date('2026-01-01'),
    });
  });
});

describe('DocentesDeCarreraController', () => {
  it('crear devuelve el docente sin la contraseña que se envió', async () => {
    const casos = { crear: async () => cuenta } as unknown as GestionarDocentes;
    const controlador = new DocentesDeCarreraController(casos);

    const r = await controlador.crear(ACTOR, {
      nombreCompleto: 'Luis Ramos',
      email: 'luis@sgc.local',
      password: 'Clave.Docente.1',
    });

    expect(JSON.stringify(r)).not.toContain('Clave.Docente.1');
    expect(Object.keys(r).sort()).toEqual(['activo', 'creadoEn', 'email', 'id', 'nombreCompleto']);
  });

  it('listar mapea cada cuenta', async () => {
    const casos = { listar: async () => [cuenta] } as unknown as GestionarDocentes;
    const controlador = new DocentesDeCarreraController(casos);

    expect(await controlador.listar(ACTOR)).toEqual([aDocenteDto(cuenta)]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/auth/infrastructure/http`
Expected: FAIL — no se resuelven `./docentes.dto.js` ni `./docentes-de-carrera.controller.js`.

- [ ] **Step 3: Implementar DTO y controlador**

Crear `apps/api/src/modules/auth/infrastructure/http/dto/docentes.dto.ts`:

```ts
import { IsBoolean, IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

import { Recortado } from '../../../../../platform/http/recortado.js';

export class CrearDocenteDto {
  @Recortado()
  @IsString()
  @Length(3, 200, { message: 'El nombre debe tener entre 3 y 200 caracteres.' })
  nombreCompleto!: string;

  /** El correo es el usuario con el que el docente inicia sesión. */
  @Recortado()
  @IsEmail({}, { message: 'El usuario debe ser un correo con formato válido.' })
  email!: string;

  /** Sin `@Recortado`: un espacio al inicio o al final puede ser parte de la contraseña. */
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede pasar de 128 caracteres.' })
  password!: string;
}

export class CambiarPasswordDocenteDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede pasar de 128 caracteres.' })
  password!: string;
}

export class CambiarEstadoDocenteDto {
  @IsBoolean()
  activo!: boolean;
}
```

Crear `apps/api/src/modules/auth/infrastructure/http/docentes-de-carrera.controller.ts`:

```ts
/**
 * Los docentes de la carrera del Director (RF-CH-010 a 014).
 *
 * Prefijo `carrera/docentes` y no `docentes`: `GET /docentes` ya existe en
 * Evaluación (catálogo de responsables) y responde otra cosa.
 *
 * Ninguna respuesta lleva la contraseña, su hash, los roles ni la carrera: la
 * pantalla solo necesita nombre, usuario y estado.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import type { DatosUsuario } from '../../application/ports/gestion-usuarios.port.js';
import { GestionarDocentes } from '../../application/use-cases/gestionar-docentes.use-case.js';
import {
  CambiarEstadoDocenteDto,
  CambiarPasswordDocenteDto,
  CrearDocenteDto,
} from './dto/docentes.dto.js';
import { ActorActual } from './jwt.guard.js';

export interface DocenteDto {
  readonly id: string;
  readonly email: string;
  readonly nombreCompleto: string;
  readonly activo: boolean;
  readonly creadoEn: Date;
}

export function aDocenteDto(cuenta: DatosUsuario): DocenteDto {
  return {
    id: cuenta.id,
    email: cuenta.email,
    nombreCompleto: cuenta.nombreCompleto,
    activo: cuenta.activo,
    creadoEn: cuenta.creadoEn,
  };
}

@ApiTags('Docentes')
@ApiBearerAuth()
@Controller('carrera/docentes')
export class DocentesDeCarreraController {
  constructor(private readonly docentes: GestionarDocentes) {}

  @Get()
  @ApiOperation({
    summary: 'Docentes de la carrera del Director',
    description: 'Activos e inactivos. Exige `docente.gestionar`.',
  })
  async listar(@ActorActual() actor: Actor): Promise<DocenteDto[]> {
    return (await this.docentes.listar(actor)).map(aDocenteDto);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un docente',
    description:
      'Queda asociado a la carrera del Director y al rol Docente. La contraseña ' +
      'la escribe el Director y no se devuelve.',
  })
  @ApiResponse({ status: 409, description: 'El usuario ya existe o falta un dato.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: CrearDocenteDto): Promise<DocenteDto> {
    return aDocenteDto(
      await this.docentes.crear(actor, {
        nombreCompleto: dto.nombreCompleto,
        email: dto.email,
        password: dto.password,
      }),
    );
  }

  @Patch(':id/password')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cambiar la contraseña de un docente',
    description: 'Solo la contraseña; revoca las sesiones abiertas del docente.',
  })
  @ApiResponse({ status: 404, description: 'No existe un docente de tu carrera con ese id.' })
  async cambiarPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarPasswordDocenteDto,
  ): Promise<void> {
    await this.docentes.cambiarPassword(actor, id, dto.password);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Inactivar o reactivar a un docente',
    description: 'Inactivo: no inicia sesión ni aparece como responsable. No borra nada.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoDocenteDto,
  ): Promise<DocenteDto> {
    return aDocenteDto(await this.docentes.cambiarEstado(actor, id, dto.activo));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar a un docente',
    description:
      'Solo si ningún registro de Mejora Continua lo referencia; si lo hay, se ' +
      'bloquea y se sugiere inactivarlo.',
  })
  @ApiResponse({ status: 409, description: 'El docente está en uso.' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ): Promise<void> {
    await this.docentes.eliminar(actor, id);
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/auth/infrastructure/http`
Expected: PASS.

- [ ] **Step 5: Cablear en `app.module.ts`**

En `apps/api/src/app.module.ts`:

1. Junto a `import { UsuariosController } from …usuarios.controller.js';` añadir:

```ts
import { DocentesDeCarreraController } from './modules/auth/infrastructure/http/docentes-de-carrera.controller.js';
```

2. Junto al import de `GestionarUsuarios` añadir:

```ts
import { GestionarDocentes } from './modules/auth/application/use-cases/gestionar-docentes.use-case.js';
import {
  DOCENTE_EN_USO,
  type DocenteEnUsoPort,
} from './modules/auth/application/ports/docente-en-uso.port.js';
import { DocenteEnUsoAdapter } from './modules/mejora-continua/evaluacion/infrastructure/persistence/docente-en-uso.adapter.js';
```

3. En `controllers: [`, después de `UsuariosController,` añadir `DocentesDeCarreraController,`.
4. En `providers: [`, después de la línea `{ provide: CONTEO_USUARIOS, useClass: ConteoDeUsuariosAdapter },` añadir:

```ts
    // La otra dirección: `auth` pregunta si un docente está en uso y
    // Mejora Continua responde con sus tablas, sin que se lean entre sí (§3.2).
    { provide: DOCENTE_EN_USO, useClass: DocenteEnUsoAdapter },
```

5. Justo después del bloque `{ provide: GestionarUsuarios, … },` añadir:

```ts
    {
      provide: GestionarDocentes,
      inject: [
        REPOSITORIO_GESTION_USUARIOS,
        SEGURIDAD_PORT,
        AUTHORIZATION_PORT,
        DOCENTE_EN_USO,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        usuarios: RepositorioGestionUsuariosPort,
        seguridad: SeguridadPort,
        autorizacion: AuthorizationPort,
        enUso: DocenteEnUsoPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarDocentes(usuarios, seguridad, autorizacion, enUso, eventos),
    },
```

- [ ] **Step 6: Typecheck, suite completa y lint**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint src/modules/auth src/modules/mejora-continua src/app.module.ts && npx prettier --write src/modules/auth src/app.module.ts`
Expected: PASS y sin errores de lint. (Si `aislamiento.spec.ts` da timeouts de 5 s, repetirlo solo.)

- [ ] **Step 7: Comprobar que la API arranca con el cableado**

Run: `cd apps/api && npm run build`
Expected: compila. El arranque real y las rutas se verifican con el e2e de la Tarea 8 (un `useFactory` mal inyectado solo falla al arrancar Nest).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(auth): endpoints /carrera/docentes para que el Director gestione a sus docentes"
```

---

### Task 6: Web — separar acceder de leer y ocultar Reportes al Docente

**Files:**
- Modify: `apps/web/src/app/App.tsx` (rutas de Criterios y de Planes de Evaluación)
- Modify: `apps/web/src/app/AppLayout.tsx` (`SECCIONES`)
- Modify: `apps/web/src/features/dashboard/pages/ResumenGenerico.tsx`
- Modify: `apps/web/src/features/dashboard/pages/VistaDocenteInicio.tsx`
- Test: `apps/web/src/app/AppLayout.test.tsx`, `apps/web/src/features/dashboard/pages/ResumenGenerico.test.tsx`, `apps/web/src/features/dashboard/pages/VistaDocenteInicio.test.tsx`

**Interfaces:**
- Consumes (Tarea 1): los permisos `criterio.acceder` y `evaluacion.acceder`.
- Produces: menú, rutas y tarjeta del resumen gobernados por `.acceder`; el puente a Reportes del inicio del Docente solo con `plan.leer`.

- [ ] **Step 1: Escribir los tests (fallan)**

En `AppLayout.test.tsx`, después del `describe('AppLayout — entrada «Plan de Estudios»', …)`, añadir (usa el mismo `montar({ puede })` de ese archivo):

```tsx
describe('AppLayout — el Docente lee Evaluación y Criterios pero no entra a esos módulos', () => {
  const comoDocente = (permiso: string) =>
    [
      'mejora.leer',
      'evidencia.registrar',
      'evaluacion.leer',
      'criterio.leer',
      'carrera.leer',
      'objetivo.leer',
      'competencia.leer',
    ].includes(permiso);

  it('ve Planes de Mejora y Mis evidencias', () => {
    montar({ puede: comoDocente });
    expect(screen.getByRole('link', { name: 'Planes de Mejora' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis evidencias' })).toBeInTheDocument();
  });

  it('no ve Planes de Evaluación ni Criterios de Acreditación aunque los pueda leer', () => {
    montar({ puede: comoDocente });
    expect(screen.queryByRole('link', { name: 'Planes de Evaluación' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Criterios de Acreditación' }),
    ).not.toBeInTheDocument();
  });

  it('con evaluacion.acceder y criterio.acceder sí los ve (Coordinador, Consultor)', () => {
    montar({
      puede: (permiso: string) => permiso === 'evaluacion.acceder' || permiso === 'criterio.acceder',
    });
    expect(screen.getByRole('link', { name: 'Planes de Evaluación' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criterios de Acreditación' })).toBeInTheDocument();
  });
});
```

En `ResumenGenerico.test.tsx`, dentro del `describe`, añadir:

```tsx
  it('Criterios de Acreditación se ofrece con criterio.acceder, no con criterio.leer', () => {
    montar(['criterio.leer']);
    expect(screen.queryByRole('link', { name: /Criterios de Acreditación/ })).not.toBeInTheDocument();
  });

  it('con criterio.acceder enlaza a Criterios de Acreditación', () => {
    montar(['criterio.acceder']);
    expect(screen.getByRole('link', { name: /Criterios de Acreditación/ })).toHaveAttribute(
      'href',
      '/acreditacion/criterios',
    );
  });
```

En `VistaDocenteInicio.test.tsx`:

1. Reemplazar la firma de `sesion` y su `puedeEn`:

```tsx
const sesion = (
  carreraACargo: string | null,
  puedeEn: (permiso: string) => boolean = () => true,
): ValorSesion => ({
```

y dentro del objeto cambiar `puedeEn: () => true,` por `puedeEn,`.

2. Reemplazar `montar`:

```tsx
function montar(
  carreraACargo: string | null = 'c1',
  puedeEn: (permiso: string) => boolean = () => true,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextoSesion.Provider value={sesion(carreraACargo, puedeEn)}>
          <VistaDocenteInicio />
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

3. Después del test `'tiene el puente a Reportes'`, añadir:

```tsx
  it('sin plan.leer no ofrece el puente a Reportes: el Docente no tiene esa sección', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(conTrabajo);
    montar('c1', (permiso) => permiso !== 'plan.leer');

    await screen.findByRole('region', { name: 'Vence pronto' });
    expect(
      screen.queryByRole('link', { name: /Resultados de mis competencias/ }),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/app/AppLayout.test.tsx src/features/dashboard/pages/ResumenGenerico.test.tsx src/features/dashboard/pages/VistaDocenteInicio.test.tsx`
Expected: FAIL — el Docente ve Evaluación y Criterios (menú), `criterio.leer` basta en el resumen y el puente a Reportes aparece siempre.

- [ ] **Step 3: Implementar**

- `AppLayout.tsx`, en `SECCIONES`: el enlace `/acreditacion/criterios` cambia `permiso: 'criterio.leer'` por `permiso: 'criterio.acceder'`; el enlace `/mejora-continua/evaluacion` cambia `permiso: 'evaluacion.leer'` por `permiso: 'evaluacion.acceder'`.
- `App.tsx`: `<RutaConPermiso permiso="criterio.leer" />` pasa a `permiso="criterio.acceder"` y `<RutaConPermiso permiso="evaluacion.leer" />` a `permiso="evaluacion.acceder"`.
- `ResumenGenerico.tsx`: en `ACTIVOS`, el módulo «Criterios de Acreditación» cambia `permiso: 'criterio.leer'` por `permiso: 'criterio.acceder'`.
- `VistaDocenteInicio.tsx`: importar `import { SiPuede } from '@/features/auth/components/SiPuede';` y envolver el puente:

```tsx
        <SiPuede permiso="plan.leer">
          <ReportBridgeCard
            titulo="Resultados de mis competencias"
            descripcion="El detalle por competencia y periodo vive en Reportes."
          />
        </SiPuede>
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run src/app src/features/dashboard`
Expected: PASS.

- [ ] **Step 5: Suite web completa, lint y typecheck**

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint src/app src/features/dashboard && npx prettier --write src/app src/features/dashboard/pages`
Expected: PASS, sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): menú y rutas de Evaluación y Criterios por permiso de acceso; el Docente sin puente a Reportes"
```

---

### Task 7: Web — sección «Docentes»

**Files:**
- Create: `apps/web/src/features/docentes/api/docentes.api.ts`
- Create: `apps/web/src/features/docentes/api/queries.ts`
- Create: `apps/web/src/features/docentes/pages/DocentesPage.tsx`
- Test: `apps/web/src/features/docentes/pages/DocentesPage.test.tsx`
- Modify: `apps/web/src/app/App.tsx` (ruta)
- Modify: `apps/web/src/features/plan-estudios/pages/PlanEstudiosPage.tsx` (entrada en `SECCIONES`)

**Interfaces:**
- Consumes (Tarea 5): las cinco rutas de `/carrera/docentes`. Consumes (Tarea 1): `docente.gestionar` como permiso de la sección.
- Produces: la ruta `plan-estudios/planes/:planId/docentes` y `docentes.api.ts` con `Docente`, `DatosNuevoDocente`, `listarDocentes`, `crearDocente`, `cambiarPasswordDocente`, `cambiarEstadoDocente`, `eliminarDocente`. La Tarea 8 navega por esa ruta.

- [ ] **Step 1: Escribir el test de la página (falla)**

Crear `apps/web/src/features/docentes/pages/DocentesPage.test.tsx`:

```tsx
/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/docentes.api';
import type { Docente } from '../api/docentes.api';
import { DocentesPage } from './DocentesPage';

const luis: Docente = {
  id: 'd1',
  email: 'luis@sgc.local',
  nombreCompleto: 'Luis Ramos',
  activo: true,
  creadoEn: '2026-09-01T10:00:00.000Z',
};

const marta: Docente = {
  id: 'd2',
  email: 'marta@sgc.local',
  nombreCompleto: 'Marta Solís',
  activo: false,
  creadoEn: '2026-09-02T10:00:00.000Z',
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/plan-estudios/planes/p1/docentes']}>
        <Routes>
          <Route path="/plan-estudios/planes/:planId/docentes" element={<DocentesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('DocentesPage', () => {
  it('lista los docentes con su usuario y su estado', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis, marta]);
    montar();

    const filaLuis = await screen.findByRole('row', { name: /Luis Ramos/ });
    expect(filaLuis).toHaveTextContent('luis@sgc.local');
    expect(filaLuis).toHaveTextContent('Activo');
    expect(screen.getByRole('row', { name: /Marta Solís/ })).toHaveTextContent('Inactivo');
  });

  it('sin docentes muestra el vacío y deja crear uno', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);
    montar();

    expect(await screen.findByText(/Aún no hay docentes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo docente' })).toBeInTheDocument();
  });

  it('el alta pide nombre, usuario y contraseña, y no ofrece elegir carrera', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);
    const crear = vi.spyOn(api, 'crearDocente').mockResolvedValue(luis);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo docente' }));
    const modal = screen.getByRole('dialog', { name: 'Nuevo docente' });

    expect(within(modal).queryByLabelText(/Carrera/)).not.toBeInTheDocument();
    await userEvent.type(within(modal).getByLabelText(/Nombre completo/), 'Luis Ramos');
    await userEvent.type(within(modal).getByLabelText(/Usuario/), 'luis@sgc.local');
    await userEvent.type(within(modal).getByLabelText(/Contraseña/), 'Clave.Docente.1');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));

    expect(crear).toHaveBeenCalledWith({
      nombreCompleto: 'Luis Ramos',
      email: 'luis@sgc.local',
      password: 'Clave.Docente.1',
    });
  });

  it('el alta muestra el motivo si el servidor la rechaza', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);
    vi.spyOn(api, 'crearDocente').mockRejectedValue(
      new ErrorDeNegocio('Ya existe una cuenta con el usuario luis@sgc.local.', 409),
    );
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo docente' }));
    const modal = screen.getByRole('dialog', { name: 'Nuevo docente' });
    await userEvent.type(within(modal).getByLabelText(/Nombre completo/), 'Luis Ramos');
    await userEvent.type(within(modal).getByLabelText(/Usuario/), 'luis@sgc.local');
    await userEvent.type(within(modal).getByLabelText(/Contraseña/), 'Clave.Docente.1');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));

    expect(await within(modal).findByRole('alert')).toHaveTextContent(/Ya existe una cuenta/);
  });

  it('editar contraseña envía solo la nueva contraseña', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    const cambiar = vi.spyOn(api, 'cambiarPasswordDocente').mockResolvedValue();
    montar();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar contraseña de Luis Ramos' }),
    );
    const modal = screen.getByRole('dialog', { name: 'Editar contraseña' });
    await userEvent.type(within(modal).getByLabelText(/Nueva contraseña/), 'Otra.Clave.Docente.2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));

    expect(cambiar).toHaveBeenCalledWith('d1', 'Otra.Clave.Docente.2');
  });

  it('inactivar pide confirmación y luego inactiva', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    const estado = vi.spyOn(api, 'cambiarEstadoDocente').mockResolvedValue({ ...luis, activo: false });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar a Luis Ramos' }));
    expect(estado).not.toHaveBeenCalled();
    const modal = screen.getByRole('dialog', { name: 'Inactivar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Inactivar' }));

    expect(estado).toHaveBeenCalledWith('d1', false);
  });

  it('un docente inactivo se reactiva', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([marta]);
    const estado = vi.spyOn(api, 'cambiarEstadoDocente').mockResolvedValue({ ...marta, activo: true });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar a Marta Solís' }));
    const modal = screen.getByRole('dialog', { name: 'Reactivar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Reactivar' }));

    expect(estado).toHaveBeenCalledWith('d2', true);
  });

  it('eliminar pide confirmación y luego elimina', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    const eliminar = vi.spyOn(api, 'eliminarDocente').mockResolvedValue();
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar a Luis Ramos' }));
    expect(eliminar).not.toHaveBeenCalled();
    const modal = screen.getByRole('dialog', { name: 'Eliminar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Eliminar' }));

    expect(eliminar).toHaveBeenCalledWith('d1');
  });

  it('si el docente está en uso, enseña el motivo y ofrece inactivarlo en su lugar', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    vi.spyOn(api, 'eliminarDocente').mockRejectedValue(
      new ErrorDeNegocio(
        'No se puede eliminar a Luis Ramos: tiene 2 evidencia(s) registrada(s). Inactívalo en su lugar.',
        409,
      ),
    );
    const estado = vi.spyOn(api, 'cambiarEstadoDocente').mockResolvedValue({ ...luis, activo: false });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar a Luis Ramos' }));
    const modal = screen.getByRole('dialog', { name: 'Eliminar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Eliminar' }));

    expect(await within(modal).findByRole('alert')).toHaveTextContent(/2 evidencia\(s\)/);
    await userEvent.click(within(modal).getByRole('button', { name: 'Inactivar en su lugar' }));

    expect(estado).toHaveBeenCalledWith('d1', false);
  });
});
```

Nota: los `getByLabelText(/Usuario/)`, `/Contraseña/` y `/Nueva contraseña/` dependen de cómo `Campo` etiqueta sus controles. Si alguno falla por el asterisco de «requerido», mirar `Campo` en `apps/web/src/shared/components/ui/index.tsx` y ajustar solo la expresión regular del test, no el componente.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/web && npx vitest run src/features/docentes`
Expected: FAIL — no se resuelven `../api/docentes.api` ni `./DocentesPage`.

- [ ] **Step 3: Implementar la capa de datos**

Crear `apps/web/src/features/docentes/api/docentes.api.ts`:

```ts
/**
 * Capa de datos de los docentes de la carrera del Director (RF-CH-010 a 014).
 *
 * La contraseña viaja solo en el cuerpo de crear y de cambiarla, y ninguna
 * respuesta la devuelve: no se guarda en el estado ni en la caché de react-query.
 */

import { cliente } from '@/shared/api/cliente';

export interface Docente {
  id: string;
  /** El correo es el usuario con el que el docente inicia sesión. */
  email: string;
  nombreCompleto: string;
  activo: boolean;
  creadoEn: string;
}

export interface DatosNuevoDocente {
  nombreCompleto: string;
  email: string;
  password: string;
}

export function listarDocentes(): Promise<Docente[]> {
  return cliente.get<Docente[]>('/carrera/docentes');
}

export function crearDocente(datos: DatosNuevoDocente): Promise<Docente> {
  return cliente.post<Docente>('/carrera/docentes', datos);
}

export async function cambiarPasswordDocente(id: string, password: string): Promise<void> {
  await cliente.patch<void>(`/carrera/docentes/${id}/password`, { password });
}

export function cambiarEstadoDocente(id: string, activo: boolean): Promise<Docente> {
  return cliente.patch<Docente>(`/carrera/docentes/${id}/estado`, { activo });
}

export function eliminarDocente(id: string): Promise<void> {
  return cliente.delete(`/carrera/docentes/${id}`);
}
```

Crear `apps/web/src/features/docentes/api/queries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from './docentes.api';

const CLAVE = ['docentes'] as const;

export function useDocentes() {
  return useQuery({ queryKey: CLAVE, queryFn: api.listarDocentes });
}

/** Toda escritura refresca el listado: el estado de un docente cambia lo que se ve. */
function useEscritura<Variables, Resultado>(fn: (variables: Variables) => Promise<Resultado>) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => cliente.invalidateQueries({ queryKey: CLAVE }),
  });
}

export const useCrearDocente = () =>
  useEscritura((datos: api.DatosNuevoDocente) => api.crearDocente(datos));

export const useCambiarPasswordDocente = () =>
  useEscritura((v: { id: string; password: string }) =>
    api.cambiarPasswordDocente(v.id, v.password),
  );

export const useCambiarEstadoDocente = () =>
  useEscritura((v: { id: string; activo: boolean }) => api.cambiarEstadoDocente(v.id, v.activo));

export const useEliminarDocente = () => useEscritura((id: string) => api.eliminarDocente(id));
```

- [ ] **Step 4: Implementar la página**

Crear `apps/web/src/features/docentes/pages/DocentesPage.tsx`:

```tsx
/**
 * Docentes de la carrera del Director (RF-CH-010 a 014).
 *
 * La pantalla no decide nada de lo que decide el servidor —la carrera, la
 * unicidad del usuario, si el docente está en uso—: anticipa lo que ayuda y
 * enseña el mensaje que devuelve el servidor para el resto. Por eso el alta no
 * tiene selector de carrera: siempre es la del Director.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
} from '@/shared/components/ui';

import type { Docente } from '../api/docentes.api';
import {
  useCambiarEstadoDocente,
  useCambiarPasswordDocente,
  useCrearDocente,
  useDocentes,
  useEliminarDocente,
} from '../api/queries';

type Accion =
  | { tipo: 'nuevo' }
  | { tipo: 'password'; docente: Docente }
  | { tipo: 'estado'; docente: Docente }
  | { tipo: 'eliminar'; docente: Docente };

export function DocentesPage() {
  const { planId } = useParams();
  const { data: docentes, isLoading } = useDocentes();
  const [accion, setAccion] = useState<Accion | null>(null);
  const cerrar = () => setAccion(null);

  return (
    <>
      <CabeceraSeccion
        titulo="Docentes"
        descripcion="Los docentes de tu carrera: quiénes pueden iniciar sesión y trabajar en los planes de mejora."
        acciones={
          <Boton variante="primario" onClick={() => setAccion({ tipo: 'nuevo' })}>
            Nuevo docente
          </Boton>
        }
      />

      {planId && (
        <Link
          to={`/plan-estudios/planes/${planId}`}
          className="mb-5 inline-block text-sm font-semibold text-uc-primary"
        >
          ← Volver al plan
        </Link>
      )}

      {isLoading ? (
        <Cargando />
      ) : !docentes || docentes.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay docentes"
          detalle="Registra al primero con «Nuevo docente»: podrá iniciar sesión con su usuario y contraseña."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Docentes de la carrera</caption>
            <thead className="border-b border-borde text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Docente
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {docentes.map((d) => (
                <tr key={d.id} className="border-b border-borde/60 last:border-0">
                  <td className="px-5 py-4">
                    <span className="font-semibold text-tinta">{d.nombreCompleto}</span>
                    <br />
                    <span className="text-xs text-tinta-suave">{d.email}</span>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tono={d.activo ? 'activo' : 'inactivo'}>
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`Editar contraseña de ${d.nombreCompleto}`}
                        onClick={() => setAccion({ tipo: 'password', docente: d })}
                      >
                        Editar contraseña
                      </Boton>
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`${d.activo ? 'Inactivar' : 'Reactivar'} a ${d.nombreCompleto}`}
                        onClick={() => setAccion({ tipo: 'estado', docente: d })}
                      >
                        {d.activo ? 'Inactivar' : 'Reactivar'}
                      </Boton>
                      <Boton
                        variante="peligro"
                        tamano="sm"
                        aria-label={`Eliminar a ${d.nombreCompleto}`}
                        onClick={() => setAccion({ tipo: 'eliminar', docente: d })}
                      >
                        Eliminar
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {accion?.tipo === 'nuevo' && <FormularioNuevoDocente onCerrar={cerrar} />}
      {accion?.tipo === 'password' && (
        <FormularioPassword docente={accion.docente} onCerrar={cerrar} />
      )}
      {accion?.tipo === 'estado' && <ConfirmarEstado docente={accion.docente} onCerrar={cerrar} />}
      {accion?.tipo === 'eliminar' && (
        <ConfirmarEliminar docente={accion.docente} onCerrar={cerrar} />
      )}
    </>
  );
}

function FormularioNuevoDocente({ onCerrar }: { onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const crear = useCrearDocente();

  function guardar() {
    setError(null);
    crear.mutate(
      { nombreCompleto: nombre, email, password },
      { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
    );
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nuevo docente"
      descripcion="Quedará asociado a tu carrera."
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={crear.isPending}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={guardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {error && <Alerta mensaje={error} />}
        <Campo etiqueta="Nombre completo" requerido>
          {(props) => (
            <Entrada {...props} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          )}
        </Campo>
        <Campo
          etiqueta="Usuario"
          ayuda="Es el correo con el que el docente inicia sesión."
          requerido
        >
          {(props) => (
            <Entrada
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre.apellido@continental.edu.pe"
            />
          )}
        </Campo>
        <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres." requerido>
          {(props) => (
            <Entrada
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}

function FormularioPassword({ docente, onCerrar }: { docente: Docente; onCerrar: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cambiar = useCambiarPasswordDocente();

  function guardar() {
    setError(null);
    cambiar.mutate(
      { id: docente.id, password },
      { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
    );
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Editar contraseña"
      descripcion={`${docente.nombreCompleto} · ${docente.email}`}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={cambiar.isPending}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={guardar} disabled={cambiar.isPending}>
            {cambiar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {error && <Alerta mensaje={error} />}
        <Campo
          etiqueta="Nueva contraseña"
          ayuda="Mínimo 8 caracteres. Cerrará las sesiones abiertas del docente."
          requerido
        >
          {(props) => (
            <Entrada
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}

function ConfirmarEstado({ docente, onCerrar }: { docente: Docente; onCerrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const cambiar = useCambiarEstadoDocente();
  const inactivar = docente.activo;
  const verbo = inactivar ? 'Inactivar' : 'Reactivar';

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`${verbo} docente`}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={cambiar.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={cambiar.isPending}
            onClick={() =>
              cambiar.mutate(
                { id: docente.id, activo: !inactivar },
                { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
              )
            }
          >
            {verbo}
          </Boton>
        </>
      }
    >
      {error && <Alerta mensaje={error} />}
      <p className="text-sm text-tinta">
        {inactivar
          ? `${docente.nombreCompleto} dejará de poder iniciar sesión y de aparecer como responsable en registros nuevos. Su historial se conserva.`
          : `${docente.nombreCompleto} volverá a poder iniciar sesión.`}
      </p>
    </Modal>
  );
}

function ConfirmarEliminar({ docente, onCerrar }: { docente: Docente; onCerrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const eliminar = useEliminarDocente();
  const inactivar = useCambiarEstadoDocente();
  const ocupado = eliminar.isPending || inactivar.isPending;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Eliminar docente"
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Boton>
          {error && docente.activo && (
            <Boton
              variante="secundario"
              disabled={ocupado}
              onClick={() =>
                inactivar.mutate(
                  { id: docente.id, activo: false },
                  { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
                )
              }
            >
              Inactivar en su lugar
            </Boton>
          )}
          <Boton
            variante="peligro"
            disabled={ocupado}
            onClick={() => {
              setError(null);
              eliminar.mutate(docente.id, {
                onSuccess: onCerrar,
                onError: (e) => setError(mensaje(e)),
              });
            }}
          >
            Eliminar
          </Boton>
        </>
      }
    >
      {error && <Alerta mensaje={error} />}
      <p className="text-sm text-tinta">
        Se borrará la cuenta de {docente.nombreCompleto} ({docente.email}). No se puede deshacer, y
        solo se permite si ningún registro la referencia.
      </p>
    </Modal>
  );
}

function Alerta({ mensaje: texto }: { mensaje: string }) {
  return (
    <p role="alert" className="mb-4 rounded-lg bg-alerta-bg px-3 py-2 text-sm text-alerta-fg">
      {texto}
    </p>
  );
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : 'No se pudo completar la operación.';
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd apps/web && npx vitest run src/features/docentes`
Expected: PASS (los 9 tests). Si falla por etiquetas, seguir la nota del Paso 1.

- [ ] **Step 6: Ruta y entrada en «Secciones de este plan»**

En `App.tsx`, importar `import { DocentesPage } from '@/features/docentes/pages/DocentesPage';` y, **dentro** del grupo `<Route element={<RutaConPermiso permiso="plan.acceder" />}>`, después de la ruta `plan-estudios/planes/:planId/malla`, añadir:

```tsx
                  <Route element={<RutaConPermiso permiso="docente.gestionar" />}>
                    <Route path="plan-estudios/planes/:planId/docentes" element={<DocentesPage />} />
                  </Route>
```

En `PlanEstudiosPage.tsx`, dentro del array `SECCIONES`, después de la entrada de `Malla Curricular`, añadir:

```ts
    {
      a: `/plan-estudios/planes/${planId}/docentes`,
      titulo: 'Docentes',
      detalle: 'Los docentes de tu carrera: alta, contraseña, inactivación y baja.',
      dato: 'Tu carrera',
      permiso: 'docente.gestionar',
    },
```

- [ ] **Step 7: Suite web completa, lint y typecheck**

Run: `cd apps/web && npx vitest run && npx tsc -b && npx eslint src/features/docentes src/app src/features/plan-estudios && npx prettier --write src/features/docentes src/app src/features/plan-estudios/pages/PlanEstudiosPage.tsx`
Expected: PASS, sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): sección Docentes en Secciones de este plan (RF-CH-010 a 014)"
```

---

### Task 8: e2e — sección Docentes y permisos del rol

**Files:**
- Create: `tests/e2e/specs/docentes.spec.ts`

**Interfaces:**
- Consumes (Tareas 5 y 7): las rutas `/carrera/docentes` y la página `plan-estudios/planes/:planId/docentes`. Usa las cuentas `director`, `editor` y `docente` que ya crea `global-setup`.

- [ ] **Step 1: Escribir el spec**

Crear `tests/e2e/specs/docentes.spec.ts`:

```ts
/**
 * Gestión de docentes por el Director (RF-CH-010 a 014) contra la API real.
 *
 * Cada prueba usa un correo único (`Date.now()`): la suite comparte base y una
 * cuenta que sobrevive a una corrida fallida no debe romper la siguiente.
 * No se inicia sesión como el docente creado: el login admite cinco intentos por
 * minuto y la suite ya gasta los cinco.
 */

import type { APIRequestContext, Page } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { analizar } from '../fixtures/axe';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

async function irADocentes(page: Page, request: APIRequestContext): Promise<void> {
  const respuesta = await request.get(`${API}/planes`, {
    headers: { authorization: `Bearer ${await tokenDe('director')}` },
  });
  expect(respuesta.ok()).toBe(true);
  const plan = ((await respuesta.json()) as { id: string; codigo: string }[]).find((p) =>
    p.codigo.startsWith('PE-E2E'),
  );
  expect(plan, 'No hay plan de estudios E2E: falta `npm run e2e:preparar`.').toBeDefined();

  await page.goto(`/plan-estudios/planes/${plan!.id}`);
  await page.getByRole('link', { name: /^Docentes/ }).click();
  await expect(page.getByRole('heading', { name: 'Docentes', level: 1 })).toBeVisible();
}

test.describe('con la cuenta de director', () => {
  test.use({ rol: 'director' });

  test('registra un docente, le cambia la contraseña, lo inactiva, lo reactiva y lo elimina', async ({
    page,
    request,
  }) => {
    const correo = `docente-${Date.now()}@sgc.local`;
    await irADocentes(page, request);

    await page.getByRole('button', { name: 'Nuevo docente' }).click();
    const alta = page.getByRole('dialog', { name: 'Nuevo docente' });
    await alta.getByLabel(/Nombre completo/).fill('Docente de Prueba');
    await alta.getByLabel(/Usuario/).fill(correo);
    await alta.getByLabel(/Contraseña/).fill('Clave.Docente.1');
    await alta.getByRole('button', { name: 'Guardar' }).click();

    const fila = page.getByRole('row', { name: new RegExp(correo) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Activo');

    await fila.getByRole('button', { name: /Editar contraseña/ }).click();
    const cambio = page.getByRole('dialog', { name: 'Editar contraseña' });
    await cambio.getByLabel(/Nueva contraseña/).fill('Otra.Clave.Docente.2');
    await cambio.getByRole('button', { name: 'Guardar' }).click();
    await expect(cambio).toBeHidden();

    await fila.getByRole('button', { name: /Inactivar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Inactivar' }).click();
    await expect(fila).toContainText('Inactivo');

    await fila.getByRole('button', { name: /Reactivar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reactivar' }).click();
    await expect(fila).toContainText('Activo');

    await fila.getByRole('button', { name: /Eliminar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toBeHidden();
  });

  test('la sección de Docentes, con un docente en la lista, sin violaciones de accesibilidad', async ({
    page,
    request,
  }) => {
    const cabeceras = {
      authorization: `Bearer ${await tokenDe('director')}`,
      'content-type': 'application/json',
    };
    const creado = await request.post(`${API}/carrera/docentes`, {
      headers: cabeceras,
      data: {
        nombreCompleto: 'Docente Axe',
        email: `axe-${Date.now()}@sgc.local`,
        password: 'Clave.Docente.1',
      },
    });
    expect(creado.ok()).toBe(true);
    const { id } = (await creado.json()) as { id: string };

    try {
      await irADocentes(page, request);
      await expect(page.getByRole('table')).toBeVisible();
      await analizar(page, 'la sección de Docentes');
    } finally {
      await request.delete(`${API}/carrera/docentes/${id}`, { headers: cabeceras });
    }
  });
});

test('solo el Director gestiona docentes: el Coordinador y el Docente reciben 403', async ({
  request,
}) => {
  for (const rol of ['editor', 'docente'] as const) {
    const respuesta = await request.get(`${API}/carrera/docentes`, {
      headers: { authorization: `Bearer ${await tokenDe(rol)}` },
    });
    expect(respuesta.status(), `El rol ${rol} no debería listar docentes.`).toBe(403);
  }
});
```

- [ ] **Step 2: Levantar la pila completa con el código nuevo**

En el worktree, instalar dependencias en cada paquete si faltan (`npm ci` en `apps/api`, `apps/web` y `tests/e2e`). Base de desarrollo (no la desechable), con el esquema y el catálogo ya aplicados por la Tarea 1 a 5:

```bash
cd apps/api
npx prisma migrate deploy
npx tsx prisma/seed.ts        # aplica la matriz nueva a los roles
npm run e2e:preparar
npm run build
```

Las cuentas `e2e-*` ya existen (si faltan, crearlas con los comandos de `tests/e2e/README.md`). Luego, cada proceso en su propia terminal o en segundo plano:

```bash
cd apps/api && THROTTLE_LIMIT=10000 node --enable-source-maps dist/main.js
cd apps/api && node --enable-source-maps dist/worker.js
cd apps/web && npm run build && npm run preview -- --port 4173
```

Expected: la API responde 401 en `http://localhost:3000/api/v1/auth/yo` y `http://localhost:4173/` responde 200.

- [ ] **Step 3: Ejecutar el spec nuevo**

Run: `cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test docentes.spec.ts --reporter=line`
Expected: PASS (3 tests). Si el primer test falla al buscar el enlace `Docentes`, comprobar que el seed del Paso 2 corrió (la cuenta `e2e-director` necesita `docente.gestionar`). Si falla el `heading` de nivel 1, mirar en `CabeceraSeccion` qué nivel renderiza y ajustar solo el selector del test.

- [ ] **Step 4: Ejecutar la suite completa, para ver que el Docente recortado no rompe nada**

Run: `cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test --reporter=line`
Expected: PASS (65 tests: los 62 previos más estos 3). En particular deben seguir pasando las pruebas de `axe` con `e2e-docente` (inicio y «Mis evidencias») y las de `e2e-editor` sobre Evaluación y Criterios.

- [ ] **Step 5: Apagar los procesos y commit**

Detener API, worker y `vite preview`. Luego:

```bash
cd tests/e2e && npx prettier --check specs/docentes.spec.ts
git add tests/e2e/specs/docentes.spec.ts
git commit -m "test(e2e): el Director gestiona docentes y solo él (RF-CH-010 a 014)"
```

---

## Verificación final

- [ ] `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint .` — verde.
- [ ] `cd apps/api && npm run test:integration` en la base `sgc_test` — verde.
- [ ] `cd apps/web && npx vitest run && npx tsc -b && npx eslint .` — verde.
- [ ] `tests/e2e`: suite completa en verde (Tarea 8, Paso 4).
- [ ] **Antes de aplicar en un entorno compartido:** volver a correr `npx tsx prisma/seed.ts`. Las cuentas DOCENTE existentes pierden los permisos de módulos que el documento no les da; es lo pedido (RF-CH-002 RN4), pero conviene avisarlo.
