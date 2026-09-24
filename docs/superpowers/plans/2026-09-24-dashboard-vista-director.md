# Vista de inicio del Director de Carrera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el stub `VistaDirectorInicio` con la pantalla de inicio del Director de Carrera (KPIs, planes de mejora abiertos, competencias bajo la meta, pendientes de decisión, resumen de Mejora Continua), alimentada por un endpoint nuevo `GET /mejora-continua/resumen-carrera` acotado siempre a la carrera del propio director.

**Architecture:** Un submódulo nuevo `mejora-continua/resumen/` con el mismo molde hexagonal de la vista Admin: una función de dominio pura (`calcularResumenDeCarrera`), un puerto de lectura propio con un único adaptador Prisma, un puerto pequeño nuevo en `plan-estudios` para «el plan vigente de una carrera», un caso de uso y un controller sin lógica. En el frontend se extrae una `TarjetaDeAccion` compartida (la tarjeta morada), y la vista solo compone componentes de Fase 0e.

**Tech Stack:** NestJS + Prisma 7 + Vitest (API); React 18 + TypeScript + `@tanstack/react-query` + Vitest/Testing Library (web); Playwright + axe-core (e2e).

**Spec:** `docs/superpowers/specs/2026-09-24-dashboard-vista-director-design.md`

## Rulings del plan (desvíos deliberados respecto al spec)

El spec es la autoridad; estos siete puntos son decisiones de diseño que el spec dejaba abiertas o que el código real obliga a resolver de otra forma. Cada uno lleva su costo si resultara equivocado.

1. **`aspecto` en vez de `aspectoCodigo`.** El spec pedía el código del criterio, objetivo o competencia al que se ata cada plan de mejora. Obtenerlo exige tres consultas más a otros módulos por una etiqueta secundaria. La fila muestra el tipo de aspecto («Competencia», «Criterio», «Objetivo»). *Costo si es un error:* añadir el código después es un campo más en la respuesta y una consulta.
2. **Un solo puerto de lectura nuevo, en vez de ampliar cuatro repositorios.** El spec (§3.3) hablaba de «consultas nuevas en los repositorios» de medición, mejora, evaluación y actas. Cada uno de esos puertos tiene falsos de prueba en varios `.spec.ts`; añadirles métodos rompería la compilación de todos. `LecturaResumenCarreraPort` agrupa las cuatro lecturas en un solo adaptador. *Costo:* ninguno funcional; si se quisiera repartir, se mueve el método al repositorio dueño.
3. **Un puerto nuevo `PlanVigenteDeCarreraPort` en `plan-estudios`, en vez de ampliar `ContenidoCurricularPort`.** El spec (§3.2) proponía ampliar el existente. Catorce archivos de prueba construyen falsos de ese puerto y dejarían de compilar. El puerto nuevo tiene un solo método. *Costo:* un archivo de puerto más y una línea en la guardia de aislamiento.
4. **Tipos de medición.** El periodo de referencia usa el plan de medición **Directa** vigente (solo la Directa tiene `fechaCierre`). «Sin responsable» cuenta las competencias sin `responsableId` de los planes de evaluación vigentes **Indirecta** y las asignaturas evaluadas sin `docenteId` de los **Directa**, porque cada tipo usa un campo distinto. *Costo:* si el proceso real mide competencias por la vía Indirecta, esas no entran en «bajo la meta».
5. **«Hoy» es la fecha calendario de Lima (UTC−5).** El servidor corre en UTC; sin este ajuste, después de las 19:00 hora de Lima el «hoy» ya sería mañana y una acción que vence hoy aparecería como vencida. *Costo:* si la universidad opera en otra zona, es una constante.
6. **Abierto = no completado y no histórico.** Una versión `HISTORICO` de un plan de mejora es una copia superada, no una tarea. *Costo:* si se quisieran contar, se quita un filtro.
7. **El KPI y el subtítulo dicen «por vencer o vencidas»,** no «vencen esta semana» como el mockup. El número cuenta también las acciones ya vencidas (son las más urgentes), y llamarlas «vencen esta semana» sería falso. *Costo:* solo es texto.

## Global Constraints

- TypeScript estricto; `any` solo con comentario que lo justifique (CLAUDE.md §2). `noUncheckedIndexedAccess` está activo en ambos paquetes.
- `domain/` no importa NestJS, Prisma ni Express. `calcularResumenDeCarrera` **no llama a `new Date()`**: recibe `hoy`.
- **Aislamiento entre módulos (CLAUDE.md §3.1/§3.2):** `mejora-continua` solo importa de `plan-estudios` archivos de `application/ports/`, y de `auth` solo `authorization.port.js` y `directorio-usuarios.port.js`. La guardia `mejora-continua/aislamiento.spec.ts` lo vigila.
- La carrera sale **siempre** de `AuthorizationPort.carreraACargoDe(actor.id)`. El endpoint no acepta `carreraId`.
- Permiso: `mejora.leer`. Sin carrera a cargo: `ReglaDeNegocioViolada` (HTTP 409) con el mensaje exacto «Esta vista necesita una carrera asignada.»
- Colores: solo tokens existentes de `apps/web/src/styles/global.css`. Ninguno nuevo.
- Sin lógica de negocio en el controller ni en el frontend: la respuesta llega ordenada y recortada.
- Textos de interfaz en español. Comentarios de código: solo el porqué no obvio, una línea.
- Antes de cada commit, formatea lo que hayas creado o tocado (`npx prettier --write <archivos>` en `apps/api` o `apps/web`): el código de este plan está escrito para leerse, no ajustado al ancho de línea de Prettier, y `format:check` corre en CI.
- **Las pruebas de integración vacían tablas con `TRUNCATE`. Nunca se corren contra la base de desarrollo `sgc`.** Usan una base desechable: `sgc_test` (README.md líneas 174–182). Preparación: `export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'`, luego `npx prisma migrate deploy && npx tsx prisma/seed.ts` desde `apps/api`, y finalmente `npm run test:integration -- <archivo>`. Si `sgc_test` no existe: `docker exec sgc_postgres createdb -U sgc sgc_test`.
- Rutas de importación (desde `src/modules/mejora-continua/resumen/…`): `application/use-cases/` sube cinco niveles a `src/`; `infrastructure/persistence/` también cinco. Los puertos de `auth` y `plan-estudios` se alcanzan con `../../../../auth/…` y `../../../../plan-estudios/…` desde `application/use-cases/`.

## Review Focus

1. **«Hoy» cerca de medianoche.** Entre las 19:00 y las 23:59 de Lima el reloj UTC ya está en el día siguiente; una acción que vence hoy debe salir «por vencer», no «vencida». Lo pinta `hoyEnLima` (Task 1, con pruebas en `03:00Z`, `04:59Z` y `05:00Z`).
2. **Otro director no ve mis datos.** Un director consulta su carrera; aunque existan planes, actas y mediciones de otra, no deben aparecer. Lo pinta la prueba de integración del caso de uso ensamblado (Task 5).
3. **Director sin carrera.** Debe recibir el 409 con el mensaje esperado, no una lista vacía ni un 500. Lo pinta la prueba del caso de uso (Task 4) y la vista (Task 8).
4. **Carrera sin plan vigente, sin plan de medición o sin periodos.** No debe fallar ni mostrar «NaN de NaN»: mediciones 0 de 0, sin alertas, plan nulo. Lo pintan las pruebas del dominio (Task 1) y del caso de uso (Task 4).
5. **Muchos planes abiertos.** Con más de 5, la lista se recorta a 5 pero los KPIs cuentan **todos**, y los vencidos que quedaron fuera de la lista siguen sumando en «por vencer o vencidas». Lo pinta Task 1.

---

### Task 1: Función de dominio `calcularResumenDeCarrera`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.ts`
- Test: `apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.spec.ts`

**Interfaces:**
- Consumes: nada (dominio puro).
- Produces (los usan Tasks 3, 4 y 5; los nombres son exactos):
  - Tipos de entrada: `EstadoDocumento`, `EstadoImplementacion`, `AspectoMejora`, `EstadoActaPendiente`, `PlanMejoraLeido`, `PeriodoLeido`, `ResultadoLeido`, `MedicionLeida`, `CompetenciaLeida`, `ActaLeida`, `SinResponsableLeido`, `EntradaResumenDeCarrera`.
  - Tipos de salida: `ChipPlan`, `PlanMejoraAbiertoVista`, `CompetenciaBajoMeta`, `PendienteVista`, `ResumenDeCarrera`.
  - Funciones: `hoyEnLima(ahora: Date): Date`, `calcularResumenDeCarrera(entrada: EntradaResumenDeCarrera): ResumenDeCarrera`.
  - Constantes: `MAXIMO_PLANES_MOSTRADOS = 5`, `MAXIMO_PENDIENTES = 5`, `DIAS_PARA_POR_VENCER = 7`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```typescript
// apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.spec.ts
import { describe, expect, it } from 'vitest';

import {
  calcularResumenDeCarrera,
  hoyEnLima,
  type ActaLeida,
  type EntradaResumenDeCarrera,
  type MedicionLeida,
  type PeriodoLeido,
  type PlanMejoraLeido,
} from './resumen-de-carrera.js';

const HOY = new Date(Date.UTC(2026, 8, 24));
const dia = (desdeHoy: number) => new Date(HOY.getTime() + desdeHoy * 86_400_000);

const plan = (p: Partial<PlanMejoraLeido> & { id: string }): PlanMejoraLeido => ({
  codigo: `PM-${p.id}`,
  nombre: `Acción ${p.id}`,
  aspecto: 'CRITERIO_ACREDITACION',
  competenciaId: null,
  estado: 'VIGENTE',
  estadoImplementacion: 'PENDIENTE',
  responsable: 'L. Vidal',
  plazo: dia(30),
  ...p,
});

const periodo = (p: Partial<PeriodoLeido> & { id: string }): PeriodoLeido => ({
  etiqueta: p.id,
  orden: 1,
  fechaCierre: null,
  programadas: 0,
  realizadas: 0,
  ...p,
});

const entrada = (e: Partial<EntradaResumenDeCarrera> = {}): EntradaResumenDeCarrera => ({
  hoy: HOY,
  carrera: { id: 'c1', nombre: 'Ingeniería de Sistemas' },
  plan: { version: 1, fechaVigencia: new Date(Date.UTC(2026, 0, 15)) },
  medicion: null,
  competencias: [],
  planesMejora: [],
  actas: [],
  sinResponsable: [],
  ...e,
});

const medicion = (m: Partial<MedicionLeida> = {}): MedicionLeida => ({
  meta: 0.7,
  periodos: [periodo({ id: 'p1', etiqueta: '2026-10', programadas: 18, realizadas: 12 })],
  resultados: [],
  ...m,
});

describe('hoyEnLima', () => {
  it('a las 22:00 de Lima (03:00Z del día siguiente) sigue siendo el mismo día', () => {
    expect(hoyEnLima(new Date('2026-09-25T03:00:00Z'))).toEqual(HOY);
  });

  it('a las 00:00 de Lima (05:00Z) ya es el día nuevo', () => {
    expect(hoyEnLima(new Date('2026-09-24T05:00:00Z'))).toEqual(HOY);
  });

  it('un minuto antes de la medianoche de Lima (04:59Z) todavía es el día anterior', () => {
    expect(hoyEnLima(new Date('2026-09-24T04:59:00Z'))).toEqual(dia(-1));
  });
});

describe('chip de cada plan de mejora abierto', () => {
  const chipDe = (plazo: Date, estadoImplementacion: PlanMejoraLeido['estadoImplementacion']) =>
    calcularResumenDeCarrera(
      entrada({ planesMejora: [plan({ id: '1', plazo, estadoImplementacion })] }),
    ).planesMejoraAbiertos[0]?.chip;

  it('plazo de ayer: VENCIDA', () => {
    expect(chipDe(dia(-1), 'PENDIENTE')).toBe('VENCIDA');
  });

  it('plazo de hoy: POR_VENCER', () => {
    expect(chipDe(dia(0), 'PENDIENTE')).toBe('POR_VENCER');
  });

  it('plazo dentro de 7 días: POR_VENCER', () => {
    expect(chipDe(dia(7), 'PENDIENTE')).toBe('POR_VENCER');
  });

  it('plazo dentro de 8 días: sigue el estado de implementación', () => {
    expect(chipDe(dia(8), 'PENDIENTE')).toBe('INICIANDO');
    expect(chipDe(dia(8), 'EN_PROCESO')).toBe('EN_PROCESO');
  });

  it('VENCIDA gana sobre EN_PROCESO', () => {
    expect(chipDe(dia(-3), 'EN_PROCESO')).toBe('VENCIDA');
  });

  it('el progreso es 50 en proceso y 0 pendiente', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: '1', estadoImplementacion: 'EN_PROCESO' }),
          plan({ id: '2', estadoImplementacion: 'PENDIENTE' }),
        ],
      }),
    );
    expect(r.planesMejoraAbiertos.map((p) => [p.id, p.progreso])).toEqual([
      ['1', 50],
      ['2', 0],
    ]);
  });

  it('el plazo sale como fecha ISO sin hora', () => {
    const r = calcularResumenDeCarrera(
      entrada({ planesMejora: [plan({ id: '1', plazo: new Date(Date.UTC(2026, 9, 12)) })] }),
    );
    expect(r.planesMejoraAbiertos[0]?.plazo).toBe('2026-10-12');
  });
});

describe('qué es un plan de mejora abierto', () => {
  it('excluye los completados y las versiones históricas', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: '1' }),
          plan({ id: '2', estadoImplementacion: 'COMPLETADO' }),
          plan({ id: '3', estado: 'HISTORICO' }),
        ],
      }),
    );
    expect(r.planesMejoraAbiertos.map((p) => p.id)).toEqual(['1']);
    expect(r.kpis.planesMejoraAbiertos).toBe(1);
    expect(r.mejoraContinua.planesMejoraAbiertos).toBe(1);
  });
});

describe('orden, tope y conteos', () => {
  const siete = [
    plan({ id: 'a', codigo: 'PM-A', plazo: dia(40) }),
    plan({ id: 'b', codigo: 'PM-B', plazo: dia(20), estadoImplementacion: 'EN_PROCESO' }),
    plan({ id: 'c', codigo: 'PM-C', plazo: dia(-5) }),
    plan({ id: 'd', codigo: 'PM-D', plazo: dia(3) }),
    plan({ id: 'e', codigo: 'PM-E', plazo: dia(2) }),
    plan({ id: 'f', codigo: 'PM-F', plazo: dia(-9) }),
    plan({ id: 'g', codigo: 'PM-G', plazo: dia(25), estadoImplementacion: 'EN_PROCESO' }),
  ];

  it('ordena por gravedad del chip, luego plazo, luego código, y corta en 5', () => {
    const r = calcularResumenDeCarrera(entrada({ planesMejora: siete }));
    expect(r.planesMejoraAbiertos.map((p) => p.id)).toEqual(['f', 'c', 'e', 'd', 'b']);
  });

  it('desempata por código cuando gravedad y plazo coinciden', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: 'x', codigo: 'PM-9', plazo: dia(40) }),
          plan({ id: 'y', codigo: 'PM-1', plazo: dia(40) }),
        ],
      }),
    );
    expect(r.planesMejoraAbiertos.map((p) => p.id)).toEqual(['y', 'x']);
  });

  it('los KPIs cuentan todos aunque la lista se recorte', () => {
    const r = calcularResumenDeCarrera(entrada({ planesMejora: siete }));
    expect(r.kpis.planesMejoraAbiertos).toBe(7);
    // vencidos (c, f) + por vencer (d, e) = 4, también los que no caben en la lista
    expect(r.kpis.accionesQueVencen).toBe(4);
  });

  it('sin planes abiertos las listas y KPIs quedan en cero', () => {
    const r = calcularResumenDeCarrera(entrada());
    expect(r.planesMejoraAbiertos).toEqual([]);
    expect(r.kpis.planesMejoraAbiertos).toBe(0);
    expect(r.kpis.accionesQueVencen).toBe(0);
  });
});

describe('periodo de referencia y mediciones', () => {
  it('sin plan de medición vigente: 0 de 0 y sin periodo', () => {
    const r = calcularResumenDeCarrera(entrada({ medicion: null }));
    expect(r.kpis.medicionesCerradas).toBe(0);
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(r.mejoraContinua.periodoMedicion).toBeNull();
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('plan de medición sin periodos: igual que sin plan', () => {
    const r = calcularResumenDeCarrera(entrada({ medicion: medicion({ periodos: [] }) }));
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(r.mejoraContinua.periodoMedicion).toBeNull();
  });

  it('toma el primer periodo no cerrado por orden', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        medicion: medicion({
          periodos: [
            periodo({ id: 'p2', etiqueta: '2026-10', orden: 2, programadas: 18, realizadas: 12 }),
            periodo({
              id: 'p1',
              etiqueta: '2026-05',
              orden: 1,
              fechaCierre: dia(-30),
              programadas: 10,
              realizadas: 10,
            }),
            periodo({ id: 'p3', etiqueta: '2027-05', orden: 3, programadas: 5, realizadas: 0 }),
          ],
        }),
      }),
    );
    expect(r.mejoraContinua.periodoMedicion).toBe('2026-10');
    expect(r.kpis.medicionesCerradas).toBe(12);
    expect(r.kpis.medicionesTotal).toBe(18);
  });

  it('un periodo que cierra hoy cuenta como cerrado: la referencia es el siguiente', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        medicion: medicion({
          periodos: [
            periodo({ id: 'p1', etiqueta: 'A', orden: 1, fechaCierre: dia(0) }),
            periodo({ id: 'p2', etiqueta: 'B', orden: 2, fechaCierre: dia(1) }),
          ],
        }),
      }),
    );
    expect(r.mejoraContinua.periodoMedicion).toBe('B');
  });

  it('si todos cerraron, toma el último por orden', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        medicion: medicion({
          periodos: [
            periodo({ id: 'p1', etiqueta: 'A', orden: 1, fechaCierre: dia(-60) }),
            periodo({ id: 'p2', etiqueta: 'B', orden: 2, fechaCierre: dia(-10) }),
          ],
        }),
      }),
    );
    expect(r.mejoraContinua.periodoMedicion).toBe('B');
  });
});

describe('competencias bajo la meta', () => {
  const competencias = [
    { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva' },
    { id: 'k2', codigo: 'CPE-02', nombre: 'Trabajo en equipo' },
    { id: 'k3', codigo: 'CPE-03', nombre: 'Ética profesional' },
  ];
  const conResultados = (resultados: MedicionLeida['resultados'], extra = {}) =>
    entrada({ competencias, medicion: medicion({ resultados }), ...extra });

  it('incluye las que están por debajo de la meta, con la meta como porcentaje entero', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 55 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', alcanzado: 55, meta: 70 },
    ]);
  });

  it('una competencia justo en la meta no cuenta', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 70 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('las ordena de peor a mejor y desempata por código', () => {
    const r = calcularResumenDeCarrera(
      conResultados([
        { competenciaId: 'k2', periodoId: 'p1', porcentaje: 60 },
        { competenciaId: 'k3', periodoId: 'p1', porcentaje: 40 },
        { competenciaId: 'k1', periodoId: 'p1', porcentaje: 60 },
      ]),
    );
    expect(r.competenciasBajoMeta.map((c) => c.codigo)).toEqual(['CPE-03', 'CPE-01', 'CPE-02']);
  });

  it('ignora resultados de otro periodo', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'otro', porcentaje: 10 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('excluye la que ya tiene un plan de mejora abierto atado', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 30 }], {
        planesMejora: [plan({ id: '1', aspecto: 'COMPETENCIA', competenciaId: 'k1' })],
      }),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('un plan de mejora completado no cuenta como cobertura', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 30 }], {
        planesMejora: [
          plan({
            id: '1',
            aspecto: 'COMPETENCIA',
            competenciaId: 'k1',
            estadoImplementacion: 'COMPLETADO',
          }),
        ],
      }),
    );
    expect(r.competenciasBajoMeta.map((c) => c.id)).toEqual(['k1']);
  });

  it('una competencia sin resultado cargado no aparece', () => {
    const r = calcularResumenDeCarrera(conResultados([]));
    expect(r.competenciasBajoMeta).toEqual([]);
  });

  it('omite un resultado de una competencia que ya no está en el plan', () => {
    const r = calcularResumenDeCarrera(
      conResultados([{ competenciaId: 'desconocida', periodoId: 'p1', porcentaje: 5 }]),
    );
    expect(r.competenciasBajoMeta).toEqual([]);
  });
});

describe('pendientes de decisión', () => {
  const acta = (a: Partial<ActaLeida> & { id: string }): ActaLeida => ({
    codigo: `ACTA N° 00${a.id} – EAP-ISI`,
    estado: 'BORRADOR',
    ...a,
  });

  it('un solo pendiente para todos los planes en revisión, urgente, con los códigos', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [
          plan({ id: '1', codigo: 'PM-011', estado: 'EN_REVISION' }),
          plan({ id: '2', codigo: 'PM-012', estado: 'EN_REVISION' }),
          plan({ id: '3', codigo: 'PM-013' }),
        ],
      }),
    );
    expect(r.pendientes).toEqual([
      {
        tipo: 'APROBAR_PLANES',
        texto: 'Aprobar 2 planes de mejora enviados',
        detalle: 'PM-011, PM-012',
        urgente: true,
      },
    ]);
  });

  it('con un plan usa el singular; con más de tres resume el resto', () => {
    const uno = calcularResumenDeCarrera(
      entrada({ planesMejora: [plan({ id: '1', codigo: 'PM-011', estado: 'EN_REVISION' })] }),
    );
    expect(uno.pendientes[0]?.texto).toBe('Aprobar 1 plan de mejora enviado');

    const cinco = calcularResumenDeCarrera(
      entrada({
        planesMejora: ['1', '2', '3', '4', '5'].map((n) =>
          plan({ id: n, codigo: `PM-0${n}`, estado: 'EN_REVISION' }),
        ),
      }),
    );
    expect(cinco.pendientes[0]?.detalle).toBe('PM-01, PM-02, PM-03 y 2 más');
  });

  it('un pendiente por acta, con el estado como detalle y sin urgencia', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        actas: [
          acta({ id: '1', estado: 'BORRADOR' }),
          acta({ id: '2', estado: 'EN_REVISION' }),
          acta({ id: '3', estado: 'APROBADA' }),
        ],
      }),
    );
    expect(r.pendientes.map((p) => [p.texto, p.detalle, p.urgente])).toEqual([
      ['Cerrar acta ACTA N° 001 – EAP-ISI', 'En borrador', false],
      ['Cerrar acta ACTA N° 002 – EAP-ISI', 'En revisión', false],
      ['Cerrar acta ACTA N° 003 – EAP-ISI', 'Aprobada', false],
    ]);
  });

  it('un pendiente por cada elemento sin responsable', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        sinResponsable: [
          { tipo: 'COMPETENCIA', nombre: 'CPE-04 · Comunicación' },
          { tipo: 'ASIGNATURA', nombre: 'Redes de Computadoras' },
        ],
      }),
    );
    expect(r.pendientes.map((p) => [p.texto, p.detalle])).toEqual([
      ['Asignar responsable a CPE-04 · Comunicación', 'Competencia sin responsable'],
      ['Asignar responsable a Redes de Computadoras', 'Asignatura evaluada sin docente'],
    ]);
  });

  it('respeta el orden por tipo y corta en 5 recortando primero los últimos', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        planesMejora: [plan({ id: '1', codigo: 'PM-011', estado: 'EN_REVISION' })],
        actas: [acta({ id: '1' }), acta({ id: '2' }), acta({ id: '3' })],
        sinResponsable: [
          { tipo: 'COMPETENCIA', nombre: 'X' },
          { tipo: 'COMPETENCIA', nombre: 'Y' },
        ],
      }),
    );
    expect(r.pendientes.map((p) => p.tipo)).toEqual([
      'APROBAR_PLANES',
      'CERRAR_ACTA',
      'CERRAR_ACTA',
      'CERRAR_ACTA',
      'ASIGNAR_RESPONSABLE',
    ]);
  });

  it('los conteos de Mejora Continua no se recortan', () => {
    const r = calcularResumenDeCarrera(
      entrada({
        actas: [acta({ id: '1' }), acta({ id: '2' })],
        sinResponsable: [
          { tipo: 'COMPETENCIA', nombre: 'X' },
          { tipo: 'ASIGNATURA', nombre: 'Y' },
          { tipo: 'ASIGNATURA', nombre: 'Z' },
        ],
      }),
    );
    expect(r.mejoraContinua.actasPorCerrar).toBe(2);
    expect(r.mejoraContinua.evaluacionesSinResponsable).toBe(3);
  });
});

describe('plan de estudios y carrera', () => {
  it('sin plan vigente: plan nulo', () => {
    expect(calcularResumenDeCarrera(entrada({ plan: null })).plan).toBeNull();
  });

  it('el año sale de la fecha de vigencia', () => {
    const r = calcularResumenDeCarrera(
      entrada({ plan: { version: 2, fechaVigencia: new Date(Date.UTC(2026, 2, 1)) } }),
    );
    expect(r.plan).toEqual({ estado: 'VIGENTE', version: 2, anio: 2026 });
  });

  it('sin fecha de vigencia el año es nulo', () => {
    const r = calcularResumenDeCarrera(entrada({ plan: { version: 1, fechaVigencia: null } }));
    expect(r.plan?.anio).toBeNull();
  });

  it('devuelve la carrera tal cual', () => {
    expect(calcularResumenDeCarrera(entrada()).carrera).toEqual({
      id: 'c1',
      nombre: 'Ingeniería de Sistemas',
    });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`): `npx vitest run src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.spec.ts`
Expected: FAIL — «Failed to resolve import "./resumen-de-carrera.js"» (el módulo no existe).

- [ ] **Step 3: Implementar la función**

```typescript
// apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.ts
/**
 * Cálculo de la vista de inicio del Director de Carrera.
 *
 * Dominio puro: recibe lo ya leído y la fecha de «hoy», y nunca consulta ni
 * llama a `new Date()`. Las pruebas de borde de fecha dependen de eso.
 *
 * Los estados usan los valores del enum de la base (`BORRADOR`, `EN_REVISION`…)
 * y no los del value object de dominio de cada submódulo: este servicio lee, no
 * transiciona, y no debe arrastrar sus máquinas de estados.
 */

const MS_DIA = 86_400_000;
const DESFASE_LIMA_MS = 5 * 3_600_000;

export const MAXIMO_PLANES_MOSTRADOS = 5;
export const MAXIMO_PENDIENTES = 5;
export const DIAS_PARA_POR_VENCER = 7;

export type EstadoDocumento = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
export type EstadoImplementacion = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO';
export type AspectoMejora = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';
export type EstadoActaPendiente = 'BORRADOR' | 'EN_REVISION' | 'APROBADA';
export type ChipPlan = 'INICIANDO' | 'EN_PROCESO' | 'POR_VENCER' | 'VENCIDA';

export interface PlanMejoraLeido {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly aspecto: AspectoMejora;
  readonly competenciaId: string | null;
  readonly estado: EstadoDocumento;
  readonly estadoImplementacion: EstadoImplementacion;
  readonly responsable: string;
  readonly plazo: Date;
}

export interface PeriodoLeido {
  readonly id: string;
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
  readonly programadas: number;
  readonly realizadas: number;
}

export interface ResultadoLeido {
  readonly competenciaId: string;
  readonly periodoId: string;
  /** 0-100. */
  readonly porcentaje: number;
}

export interface MedicionLeida {
  /** Fracción decimal: 70 % → 0.7. */
  readonly meta: number;
  readonly periodos: readonly PeriodoLeido[];
  readonly resultados: readonly ResultadoLeido[];
}

export interface CompetenciaLeida {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface ActaLeida {
  readonly id: string;
  readonly codigo: string;
  readonly estado: EstadoActaPendiente;
}

export interface SinResponsableLeido {
  readonly tipo: 'COMPETENCIA' | 'ASIGNATURA';
  readonly nombre: string;
}

export interface EntradaResumenDeCarrera {
  readonly hoy: Date;
  readonly carrera: { readonly id: string; readonly nombre: string };
  readonly plan: { readonly version: number; readonly fechaVigencia: Date | null } | null;
  readonly medicion: MedicionLeida | null;
  readonly competencias: readonly CompetenciaLeida[];
  readonly planesMejora: readonly PlanMejoraLeido[];
  readonly actas: readonly ActaLeida[];
  readonly sinResponsable: readonly SinResponsableLeido[];
}

export interface PlanMejoraAbiertoVista {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly aspecto: AspectoMejora;
  readonly responsable: string;
  /** Fecha ISO sin hora: `AAAA-MM-DD`. */
  readonly plazo: string;
  readonly estadoImplementacion: 'PENDIENTE' | 'EN_PROCESO';
  /** Convención visual (0 o 50), no una medición: el sistema no guarda un avance. */
  readonly progreso: 0 | 50;
  readonly chip: ChipPlan;
}

export interface CompetenciaBajoMeta {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly alcanzado: number;
  readonly meta: number;
}

export interface PendienteVista {
  readonly tipo: 'APROBAR_PLANES' | 'CERRAR_ACTA' | 'ASIGNAR_RESPONSABLE';
  readonly texto: string;
  readonly detalle: string;
  readonly urgente: boolean;
}

export interface ResumenDeCarrera {
  readonly carrera: { readonly id: string; readonly nombre: string };
  readonly plan: { readonly estado: 'VIGENTE'; readonly version: number; readonly anio: number | null } | null;
  readonly kpis: {
    readonly medicionesCerradas: number;
    readonly medicionesTotal: number;
    readonly planesMejoraAbiertos: number;
    readonly accionesQueVencen: number;
  };
  readonly planesMejoraAbiertos: readonly PlanMejoraAbiertoVista[];
  readonly competenciasBajoMeta: readonly CompetenciaBajoMeta[];
  readonly pendientes: readonly PendienteVista[];
  readonly mejoraContinua: {
    readonly periodoMedicion: string | null;
    readonly evaluacionesSinResponsable: number;
    readonly planesMejoraAbiertos: number;
    readonly actasPorCerrar: number;
  };
}

/**
 * La fecha calendario de Lima (UTC−5) a medianoche UTC.
 *
 * El servidor corre en UTC: pasadas las 19:00 de Lima, el reloj UTC ya está en
 * el día siguiente y una acción que vence hoy saldría como vencida.
 */
export function hoyEnLima(ahora: Date): Date {
  const lima = new Date(ahora.getTime() - DESFASE_LIMA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()));
}

function diaUtc(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

const GRAVEDAD: Readonly<Record<ChipPlan, number>> = {
  VENCIDA: 0,
  POR_VENCER: 1,
  EN_PROCESO: 2,
  INICIANDO: 3,
};

function chipDe(plan: PlanMejoraLeido, hoy: Date): ChipPlan {
  const dias = (diaUtc(plan.plazo) - diaUtc(hoy)) / MS_DIA;
  if (dias < 0) return 'VENCIDA';
  if (dias <= DIAS_PARA_POR_VENCER) return 'POR_VENCER';
  return plan.estadoImplementacion === 'EN_PROCESO' ? 'EN_PROCESO' : 'INICIANDO';
}

/** El primer periodo aún abierto; si todos cerraron, el último por orden. */
function periodoDeReferencia(periodos: readonly PeriodoLeido[], hoy: Date): PeriodoLeido | null {
  const ordenados = [...periodos].sort((a, b) => a.orden - b.orden);
  const abierto = ordenados.find((p) => p.fechaCierre === null || diaUtc(p.fechaCierre) > diaUtc(hoy));
  return abierto ?? ordenados.at(-1) ?? null;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

const ETIQUETA_ACTA: Readonly<Record<EstadoActaPendiente, string>> = {
  BORRADOR: 'En borrador',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
};

function pendientesDe(entrada: EntradaResumenDeCarrera): PendienteVista[] {
  const enRevision = entrada.planesMejora.filter(
    (p) => p.estado === 'EN_REVISION' && p.estadoImplementacion !== 'COMPLETADO',
  );
  const aprobar: PendienteVista[] =
    enRevision.length === 0
      ? []
      : [
          {
            tipo: 'APROBAR_PLANES',
            texto: `Aprobar ${plural(enRevision.length, 'plan de mejora enviado', 'planes de mejora enviados')}`,
            detalle:
              enRevision
                .slice(0, 3)
                .map((p) => p.codigo)
                .join(', ') + (enRevision.length > 3 ? ` y ${enRevision.length - 3} más` : ''),
            urgente: true,
          },
        ];

  const actas: PendienteVista[] = entrada.actas.map((a) => ({
    tipo: 'CERRAR_ACTA',
    texto: `Cerrar acta ${a.codigo}`,
    detalle: ETIQUETA_ACTA[a.estado],
    urgente: false,
  }));

  const responsables: PendienteVista[] = entrada.sinResponsable.map((s) => ({
    tipo: 'ASIGNAR_RESPONSABLE',
    texto: `Asignar responsable a ${s.nombre}`,
    detalle: s.tipo === 'COMPETENCIA' ? 'Competencia sin responsable' : 'Asignatura evaluada sin docente',
    urgente: false,
  }));

  return [...aprobar, ...actas, ...responsables].slice(0, MAXIMO_PENDIENTES);
}

export function calcularResumenDeCarrera(entrada: EntradaResumenDeCarrera): ResumenDeCarrera {
  const abiertos = entrada.planesMejora.filter(
    (p) => p.estadoImplementacion !== 'COMPLETADO' && p.estado !== 'HISTORICO',
  );

  const conChip = abiertos.map((p) => ({ plan: p, chip: chipDe(p, entrada.hoy) }));
  const accionesQueVencen = conChip.filter((c) => c.chip === 'VENCIDA' || c.chip === 'POR_VENCER').length;

  const planesMejoraAbiertos: PlanMejoraAbiertoVista[] = [...conChip]
    .sort(
      (a, b) =>
        GRAVEDAD[a.chip] - GRAVEDAD[b.chip] ||
        diaUtc(a.plan.plazo) - diaUtc(b.plan.plazo) ||
        a.plan.codigo.localeCompare(b.plan.codigo),
    )
    .slice(0, MAXIMO_PLANES_MOSTRADOS)
    .map(({ plan, chip }) => ({
      id: plan.id,
      codigo: plan.codigo,
      nombre: plan.nombre,
      aspecto: plan.aspecto,
      responsable: plan.responsable,
      plazo: plan.plazo.toISOString().slice(0, 10),
      estadoImplementacion: plan.estadoImplementacion === 'EN_PROCESO' ? 'EN_PROCESO' : 'PENDIENTE',
      progreso: plan.estadoImplementacion === 'EN_PROCESO' ? 50 : 0,
      chip,
    }));

  const referencia = entrada.medicion
    ? periodoDeReferencia(entrada.medicion.periodos, entrada.hoy)
    : null;

  const competenciasBajoMeta: CompetenciaBajoMeta[] = [];
  if (entrada.medicion && referencia) {
    const meta = Math.round(entrada.medicion.meta * 100);
    const conPlan = new Set(
      abiertos
        .filter((p) => p.aspecto === 'COMPETENCIA' && p.competenciaId !== null)
        .map((p) => p.competenciaId),
    );
    const porId = new Map(entrada.competencias.map((c) => [c.id, c]));
    for (const r of entrada.medicion.resultados) {
      if (r.periodoId !== referencia.id || r.porcentaje >= meta || conPlan.has(r.competenciaId)) continue;
      const c = porId.get(r.competenciaId);
      if (!c) continue;
      competenciasBajoMeta.push({
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        alcanzado: r.porcentaje,
        meta,
      });
    }
    competenciasBajoMeta.sort(
      (a, b) => a.alcanzado - b.alcanzado || a.codigo.localeCompare(b.codigo),
    );
  }

  return {
    carrera: entrada.carrera,
    plan: entrada.plan
      ? {
          estado: 'VIGENTE',
          version: entrada.plan.version,
          anio: entrada.plan.fechaVigencia ? entrada.plan.fechaVigencia.getUTCFullYear() : null,
        }
      : null,
    kpis: {
      medicionesCerradas: referencia?.realizadas ?? 0,
      medicionesTotal: referencia?.programadas ?? 0,
      planesMejoraAbiertos: abiertos.length,
      accionesQueVencen,
    },
    planesMejoraAbiertos,
    competenciasBajoMeta,
    pendientes: pendientesDe(entrada),
    mejoraContinua: {
      periodoMedicion: referencia?.etiqueta ?? null,
      evaluacionesSinResponsable: entrada.sinResponsable.length,
      planesMejoraAbiertos: abiertos.length,
      actasPorCerrar: entrada.actas.length,
    },
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.spec.ts`
Expected: PASS (todas las pruebas). Sobre «un periodo que cierra hoy…»: `fechaCierre = hoy` no es «posterior a hoy», así que ese periodo está cerrado y la referencia es el siguiente («B»); así lo define el spec (§4.1).

- [ ] **Step 5: Typecheck y lint del archivo**

Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/resumen`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.ts \
        apps/api/src/modules/mejora-continua/resumen/domain/services/resumen-de-carrera.spec.ts
git commit -m "feat(mejora-continua): función de dominio calcularResumenDeCarrera"
```

---

### Task 2: Puerto `PlanVigenteDeCarreraPort` en `plan-estudios` + adaptador + guardia

**Files:**
- Create: `apps/api/src/modules/plan-estudios/application/ports/plan-vigente.port.ts`
- Create: `apps/api/src/modules/plan-estudios/infrastructure/plan-vigente.adapter.ts`
- Modify: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts` (lista `PUERTO_PERMITIDO`, línea ~35)
- Test: `apps/api/test/integration/plan-vigente.int.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` de `platform/database/prisma.service.js`.
- Produces (los usan Tasks 4 y 5): `PlanVigente`, `PlanVigenteDeCarreraPort`, `PLAN_VIGENTE_DE_CARRERA` (Symbol), `PlanVigenteAdapter`.

- [ ] **Step 1: Escribir la prueba de integración que falla**

```typescript
// apps/api/test/integration/plan-vigente.int.spec.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanVigenteAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new PlanVigenteAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function carrera(codigo: string): Promise<string> {
  const facultad = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function plan(
  carreraId: string,
  version: number,
  estado: 'BORRADOR' | 'APROBADO' | 'VIGENTE' | 'HISTORICO',
  fechaVigencia: Date | null = null,
) {
  return prisma.planEstudios.create({
    data: {
      carreraId,
      codigo: `PE-${carreraId.slice(0, 6)}-v${version}`,
      version,
      estado,
      duracionAnios: 5,
      fechaVigencia,
    },
  });
}

describe('PlanVigenteAdapter contra la base real', () => {
  it('devuelve el plan Vigente de la carrera con su versión y fecha de vigencia', async () => {
    const id = await carrera('SIS');
    const fecha = new Date('2026-03-01T00:00:00Z');
    await plan(id, 1, 'HISTORICO');
    const vigente = await plan(id, 2, 'VIGENTE', fecha);
    await plan(id, 3, 'BORRADOR');

    const r = await adaptador.planVigenteDeCarrera(id);

    expect(r).toEqual({
      id: vigente.id,
      codigo: vigente.codigo,
      version: 2,
      fechaVigencia: fecha,
    });
  });

  it('ignora los planes que no están Vigentes', async () => {
    const id = await carrera('CIV');
    await plan(id, 1, 'APROBADO');
    await plan(id, 2, 'BORRADOR');

    expect(await adaptador.planVigenteDeCarrera(id)).toBeNull();
  });

  it('no mezcla carreras: el vigente de otra no cuenta', async () => {
    const a = await carrera('AAA');
    const b = await carrera('BBB');
    await plan(a, 1, 'VIGENTE');

    expect(await adaptador.planVigenteDeCarrera(b)).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`, con la base `sgc_test` preparada según Global Constraints): `npm run test:integration -- plan-vigente`
Expected: FAIL — no se puede resolver `plan-vigente.adapter.js`.

- [ ] **Step 3: Escribir el puerto y el adaptador**

```typescript
// apps/api/src/modules/plan-estudios/application/ports/plan-vigente.port.ts
/**
 * El plan de estudios Vigente de una carrera, para quien lo necesite desde otro
 * módulo (la vista de inicio del Director en Mejora Continua).
 *
 * Puerto propio y no un método más de `ContenidoCurricularPort`: ese puerto lo
 * fingen catorce archivos de prueba, y ampliarlo rompería la compilación de todos
 * por un dato que solo usa una consulta.
 */

export interface PlanVigente {
  readonly id: string;
  readonly codigo: string;
  readonly version: number;
  /** Nulo si el plan llegó a Vigente sin fecha registrada. */
  readonly fechaVigencia: Date | null;
}

export interface PlanVigenteDeCarreraPort {
  /** El plan en estado Vigente de la carrera, o `null` si no tiene. */
  planVigenteDeCarrera(carreraId: string): Promise<PlanVigente | null>;
}

export const PLAN_VIGENTE_DE_CARRERA = Symbol('PlanVigenteDeCarreraPort');
```

```typescript
// apps/api/src/modules/plan-estudios/infrastructure/plan-vigente.adapter.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  PlanVigente,
  PlanVigenteDeCarreraPort,
} from '../application/ports/plan-vigente.port.js';

@Injectable()
export class PlanVigenteAdapter implements PlanVigenteDeCarreraPort {
  constructor(private readonly prisma: PrismaService) {}

  async planVigenteDeCarrera(carreraId: string): Promise<PlanVigente | null> {
    // Una carrera tiene como máximo un plan Vigente (CLAUDE.md §3.3), así que
    // `findFirst` es exacto y no una elección entre varios.
    return this.prisma.planEstudios.findFirst({
      where: { carreraId, estado: 'VIGENTE' },
      select: { id: true, codigo: true, version: true, fechaVigencia: true },
    });
  }
}
```

- [ ] **Step 4: Permitir el puerto nuevo en la guardia de aislamiento**

En `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`, la constante `PUERTO_PERMITIDO` (línea ~35) es una lista de sufijos. Añade el puerto nuevo y actualiza el comentario de arriba («Dos puertos desde 2c-J-B») para que diga tres:

```typescript
const PUERTO_PERMITIDO = [
  'ports/contenido-curricular.port.js',
  'ports/acreditacion-cross-modulo.port.js',
  'ports/plan-vigente.port.js',
];
```

- [ ] **Step 5: Verificar que pasan la integración y la guardia**

Run: `npm run test:integration -- plan-vigente` → PASS (3 pruebas).
Run: `npx vitest run src/modules/mejora-continua/aislamiento.spec.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/plan-estudios/application/ports/plan-vigente.port.ts \
        apps/api/src/modules/plan-estudios/infrastructure/plan-vigente.adapter.ts \
        apps/api/src/modules/mejora-continua/aislamiento.spec.ts \
        apps/api/test/integration/plan-vigente.int.spec.ts
git commit -m "feat(plan-estudios): PlanVigenteDeCarreraPort y su adaptador"
```

---

### Task 3: Puerto de lectura y adaptador Prisma del resumen

**Files:**
- Create: `apps/api/src/modules/mejora-continua/resumen/application/ports/lectura-resumen-carrera.port.ts`
- Create: `apps/api/src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.ts`
- Test: `apps/api/test/integration/resumen-carrera.int.spec.ts`

**Interfaces:**
- Consumes: tipos `PlanMejoraLeido`, `MedicionLeida`, `ActaLeida` de Task 1 (`../../domain/services/resumen-de-carrera.js`); `PrismaService`.
- Produces (los usan Tasks 4 y 5): `SinResponsableCrudo`, `LecturaResumenCarreraPort`, `LECTURA_RESUMEN_CARRERA` (Symbol), `ResumenCarreraRepositoryPrisma`.

- [ ] **Step 1: Escribir la prueba de integración que falla**

```typescript
// apps/api/test/integration/resumen-carrera.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ResumenCarreraRepositoryPrisma } from '../../src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new ResumenCarreraRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion,
      mejora_continua.planes_mejora, mejora_continua.actas_aprobacion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function planDeEstudios(): Promise<{ carreraId: string; planId: string }> {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: `C${randomUUID().slice(0, 6)}`, duracionAnios: 5 },
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
  return { carreraId: carrera.id, planId: plan.id };
}

async function planMedicion(
  planEstudiosId: string,
  tipo: 'DIRECTA' | 'INDIRECTA',
  estado: 'VIGENTE' | 'BORRADOR' = 'VIGENTE',
  meta = 0.7,
) {
  return prisma.planMedicion.create({
    data: { planEstudiosId, tipo, codigo: `PM-${randomUUID().slice(0, 8)}`, meta, estado },
  });
}

async function planEvaluacion(planMedicionId: string, estado: 'VIGENTE' | 'BORRADOR' = 'VIGENTE') {
  return prisma.planEvaluacion.create({
    data: { planMedicionId, codigo: `EV-${randomUUID().slice(0, 8)}`, estado },
  });
}

describe('medicionDirectaVigente', () => {
  it('sin plan de medición Directa vigente devuelve null', async () => {
    const { planId } = await planDeEstudios();
    await planMedicion(planId, 'DIRECTA', 'BORRADOR');
    await planMedicion(planId, 'INDIRECTA', 'VIGENTE');

    expect(await repo.medicionDirectaVigente(planId)).toBeNull();
  });

  it('cuenta celdas programadas y realizadas por periodo, y trae la meta como fracción', async () => {
    const { planId } = await planDeEstudios();
    const pm = await planMedicion(planId, 'DIRECTA', 'VIGENTE', 0.7);
    const p1 = await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-05', orden: 1, fechaCierre: new Date('2026-06-30') },
    });
    const p2 = await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-10', orden: 2 },
    });
    const [k1, k2, k3] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.programacion.createMany({
      data: [
        { planMedicionId: pm.id, competenciaId: k1, periodoId: p2.id, realizada: true },
        { planMedicionId: pm.id, competenciaId: k2, periodoId: p2.id, realizada: false },
        { planMedicionId: pm.id, competenciaId: k3, periodoId: p2.id, realizada: true },
        { planMedicionId: pm.id, competenciaId: k1, periodoId: p1.id, realizada: true },
      ],
    });

    const r = await repo.medicionDirectaVigente(planId);

    expect(r?.meta).toBeCloseTo(0.7);
    expect(r?.periodos.map((p) => [p.etiqueta, p.programadas, p.realizadas])).toEqual([
      ['2026-05', 1, 1],
      ['2026-10', 3, 2],
    ]);
    expect(r?.periodos[0]?.fechaCierre).toEqual(new Date('2026-06-30'));
    expect(r?.periodos[1]?.fechaCierre).toBeNull();
  });

  it('trae los resultados del plan de evaluación vigente y omite los sin valor', async () => {
    const { planId } = await planDeEstudios();
    const pm = await planMedicion(planId, 'DIRECTA');
    const p = await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-10', orden: 1 },
    });
    const ev = await planEvaluacion(pm.id, 'VIGENTE');
    const evBorrador = await planEvaluacion(pm.id, 'BORRADOR');
    const [k1, k2, k3] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.medicionAlcanzada.createMany({
      data: [
        { planEvaluacionId: ev.id, competenciaId: k1, periodoId: p.id, porcentajeAlcanzado: 55 },
        { planEvaluacionId: ev.id, competenciaId: k2, periodoId: p.id, porcentajeAlcanzado: null },
        { planEvaluacionId: evBorrador.id, competenciaId: k3, periodoId: p.id, porcentajeAlcanzado: 10 },
      ],
    });

    const r = await repo.medicionDirectaVigente(planId);

    expect(r?.resultados).toEqual([{ competenciaId: k1, periodoId: p.id, porcentaje: 55 }]);
  });
});

describe('planesMejoraDeCarrera', () => {
  const definicion = {
    nombre: 'Actualizar rúbrica',
    causaRaiz: 'x',
    justificacion: 'x',
    recursos: 'x',
    metas: 'x',
    responsable: 'L. Vidal',
    plazo: new Date('2026-10-12'),
  };

  it('trae los planes de la carrera, con sus estados, y omite las versiones históricas', async () => {
    const { carreraId } = await planDeEstudios();
    const otra = await planDeEstudios();
    const k = randomUUID();
    await prisma.planMejora.createMany({
      data: [
        { ...definicion, codigo: 'PM-1', aspecto: 'COMPETENCIA', carreraId, competenciaId: k, estado: 'EN_REVISION' },
        { ...definicion, codigo: 'PM-2', aspecto: 'CRITERIO_ACREDITACION', carreraId, estado: 'VIGENTE', estadoImplementacion: 'EN_PROCESO' },
        { ...definicion, codigo: 'PM-3', aspecto: 'CRITERIO_ACREDITACION', carreraId, estado: 'HISTORICO' },
        { ...definicion, codigo: 'PM-4', aspecto: 'CRITERIO_ACREDITACION', carreraId: otra.carreraId },
      ],
    });

    const r = await repo.planesMejoraDeCarrera(carreraId);

    expect(r.map((p) => p.codigo).sort()).toEqual(['PM-1', 'PM-2']);
    const pm1 = r.find((p) => p.codigo === 'PM-1');
    expect(pm1).toMatchObject({
      aspecto: 'COMPETENCIA',
      competenciaId: k,
      estado: 'EN_REVISION',
      estadoImplementacion: 'PENDIENTE',
      responsable: 'L. Vidal',
      plazo: new Date('2026-10-12'),
    });
  });
});

describe('actasPorCerrarDeCarrera', () => {
  const acta = (carreraId: string, correlativo: number, estado: string) => ({
    carreraId,
    correlativo,
    codigo: `ACTA N° 00${correlativo}`,
    periodoAcademico: '2026-10',
    titulo: 't',
    objetivo: 'o',
    convocadaPor: '',
    fechaReunion: new Date(0),
    lugarReunion: '',
    textoIntroduccion: 'i',
    textoAcuerdoCierre: 'c',
    estado: estado as 'BORRADOR',
  });

  it('trae solo las de la carrera que no están Emitidas ni Históricas', async () => {
    const { carreraId } = await planDeEstudios();
    const otra = await planDeEstudios();
    await prisma.actaAprobacion.createMany({
      data: [
        acta(carreraId, 1, 'BORRADOR'),
        acta(carreraId, 2, 'EN_REVISION'),
        acta(carreraId, 3, 'APROBADA'),
        acta(carreraId, 4, 'EMITIDA'),
        acta(carreraId, 5, 'HISTORICA'),
        acta(otra.carreraId, 1, 'BORRADOR'),
      ],
    });

    const r = await repo.actasPorCerrarDeCarrera(carreraId);

    expect(r.map((a) => [a.codigo, a.estado])).toEqual([
      ['ACTA N° 001', 'BORRADOR'],
      ['ACTA N° 002', 'EN_REVISION'],
      ['ACTA N° 003', 'APROBADA'],
    ]);
  });
});

describe('sinResponsableDe', () => {
  it('cuenta competencias sin responsable (Indirecta) y asignaturas sin docente (Directa)', async () => {
    const { planId } = await planDeEstudios();
    const directa = await planMedicion(planId, 'DIRECTA');
    const indirecta = await planMedicion(planId, 'INDIRECTA');
    const evDirecta = await planEvaluacion(directa.id);
    const evIndirecta = await planEvaluacion(indirecta.id);
    const p = await prisma.periodoMedicion.create({
      data: { planMedicionId: directa.id, etiqueta: '2026-10', orden: 1 },
    });
    const [kSin, kCon, kDirecta, docente, asigSin, asigCon] = Array.from({ length: 6 }, () => randomUUID());

    await prisma.configuracionCompetencia.createMany({
      data: [
        { planEvaluacionId: evIndirecta.id, competenciaId: kSin! },
        { planEvaluacionId: evIndirecta.id, competenciaId: kCon!, responsableId: docente! },
        // En un plan Directa el responsable de competencia no se usa: no debe contar.
        { planEvaluacionId: evDirecta.id, competenciaId: kDirecta! },
      ],
    });
    const medicion = await prisma.medicionAlcanzada.create({
      data: { planEvaluacionId: evDirecta.id, competenciaId: kDirecta!, periodoId: p.id },
    });
    await prisma.asignaturaEvaluada.createMany({
      data: [
        { medicionAlcanzadaId: medicion.id, asignaturaId: asigSin!, entregable: 'Informe' },
        { medicionAlcanzadaId: medicion.id, asignaturaId: asigCon!, entregable: 'Proyecto', docenteId: docente! },
      ],
    });

    const r = await repo.sinResponsableDe(planId);

    expect(r).toEqual(
      expect.arrayContaining([
        { tipo: 'COMPETENCIA', referenciaId: kSin },
        { tipo: 'ASIGNATURA', referenciaId: asigSin },
      ]),
    );
    expect(r).toHaveLength(2);
  });

  it('ignora los planes de evaluación que no están vigentes', async () => {
    const { planId } = await planDeEstudios();
    const indirecta = await planMedicion(planId, 'INDIRECTA');
    const evBorrador = await planEvaluacion(indirecta.id, 'BORRADOR');
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: evBorrador.id, competenciaId: randomUUID() },
    });

    expect(await repo.sinResponsableDe(planId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:integration -- resumen-carrera`
Expected: FAIL — no se puede resolver `resumen-carrera.repository.js`.

- [ ] **Step 3: Escribir el puerto de lectura**

```typescript
// apps/api/src/modules/mejora-continua/resumen/application/ports/lectura-resumen-carrera.port.ts
/**
 * Las cuatro lecturas que necesita la vista de inicio del Director.
 *
 * Un solo puerto de solo lectura, con un solo adaptador, y no un método más en
 * los repositorios de medición, mejora, evaluación y actas: esos puertos los
 * fingen muchos archivos de prueba, y cada uno sirve a operaciones que escriben.
 * Aquí se lee, y se lee acotado a una carrera.
 */

import type {
  ActaLeida,
  MedicionLeida,
  PlanMejoraLeido,
} from '../../domain/services/resumen-de-carrera.js';

/** Sin nombre todavía: quien lo resuelve es el caso de uso, con el puerto curricular. */
export interface SinResponsableCrudo {
  readonly tipo: 'COMPETENCIA' | 'ASIGNATURA';
  readonly referenciaId: string;
}

export interface LecturaResumenCarreraPort {
  /**
   * El plan de medición **Directa** vigente del plan de estudios, con sus
   * periodos (con celdas programadas y realizadas) y los resultados de su plan
   * de evaluación vigente. `null` si no hay plan Directa vigente.
   */
  medicionDirectaVigente(planEstudiosId: string): Promise<MedicionLeida | null>;

  /** Los planes de mejora de la carrera, salvo las versiones históricas. */
  planesMejoraDeCarrera(carreraId: string): Promise<readonly PlanMejoraLeido[]>;

  /** Actas de la carrera que no están Emitidas ni Históricas. */
  actasPorCerrarDeCarrera(carreraId: string): Promise<readonly ActaLeida[]>;

  /**
   * Competencias sin responsable en los planes de evaluación Indirecta vigentes
   * y asignaturas evaluadas sin docente en los Directa vigentes: cada tipo usa un
   * campo distinto para nombrar a quien responde.
   */
  sinResponsableDe(planEstudiosId: string): Promise<readonly SinResponsableCrudo[]>;
}

export const LECTURA_RESUMEN_CARRERA = Symbol('LecturaResumenCarreraPort');
```

- [ ] **Step 4: Escribir el adaptador Prisma**

```typescript
// apps/api/src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  LecturaResumenCarreraPort,
  SinResponsableCrudo,
} from '../../application/ports/lectura-resumen-carrera.port.js';
import type {
  ActaLeida,
  MedicionLeida,
  PlanMejoraLeido,
} from '../../domain/services/resumen-de-carrera.js';

@Injectable()
export class ResumenCarreraRepositoryPrisma implements LecturaResumenCarreraPort {
  constructor(private readonly prisma: PrismaService) {}

  async medicionDirectaVigente(planEstudiosId: string): Promise<MedicionLeida | null> {
    const plan = await this.prisma.planMedicion.findFirst({
      where: { planEstudiosId, tipo: 'DIRECTA', estado: 'VIGENTE' },
      select: {
        id: true,
        meta: true,
        periodos: {
          select: { id: true, etiqueta: true, orden: true, fechaCierre: true },
          orderBy: { orden: 'asc' },
        },
      },
    });
    if (!plan) return null;

    const [celdas, evaluacion] = await Promise.all([
      this.prisma.programacion.findMany({
        where: { planMedicionId: plan.id },
        select: { periodoId: true, realizada: true },
      }),
      this.prisma.planEvaluacion.findFirst({
        where: { planMedicionId: plan.id, estado: 'VIGENTE' },
        select: { id: true },
      }),
    ]);

    const resultados = evaluacion
      ? await this.prisma.medicionAlcanzada.findMany({
          where: { planEvaluacionId: evaluacion.id, porcentajeAlcanzado: { not: null } },
          select: { competenciaId: true, periodoId: true, porcentajeAlcanzado: true },
        })
      : [];

    return {
      meta: Number(plan.meta),
      periodos: plan.periodos.map((p) => {
        const deEste = celdas.filter((c) => c.periodoId === p.id);
        return {
          id: p.id,
          etiqueta: p.etiqueta,
          orden: p.orden,
          fechaCierre: p.fechaCierre,
          programadas: deEste.length,
          realizadas: deEste.filter((c) => c.realizada).length,
        };
      }),
      resultados: resultados.map((r) => ({
        competenciaId: r.competenciaId,
        periodoId: r.periodoId,
        // El filtro `not: null` de arriba garantiza el valor.
        porcentaje: r.porcentajeAlcanzado ?? 0,
      })),
    };
  }

  async planesMejoraDeCarrera(carreraId: string): Promise<readonly PlanMejoraLeido[]> {
    const filas = await this.prisma.planMejora.findMany({
      where: { carreraId, estado: { not: 'HISTORICO' } },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        aspecto: true,
        competenciaId: true,
        estado: true,
        estadoImplementacion: true,
        responsable: true,
        plazo: true,
      },
    });
    return filas;
  }

  async actasPorCerrarDeCarrera(carreraId: string): Promise<readonly ActaLeida[]> {
    const filas = await this.prisma.actaAprobacion.findMany({
      where: { carreraId, estado: { in: ['BORRADOR', 'EN_REVISION', 'APROBADA'] } },
      select: { id: true, codigo: true, estado: true },
      orderBy: { correlativo: 'asc' },
    });
    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      // El filtro de arriba deja fuera EMITIDA e HISTORICA.
      estado: f.estado as ActaLeida['estado'],
    }));
  }

  async sinResponsableDe(planEstudiosId: string): Promise<readonly SinResponsableCrudo[]> {
    const [competencias, asignaturas] = await Promise.all([
      this.prisma.configuracionCompetencia.findMany({
        where: {
          responsableId: null,
          plan: { estado: 'VIGENTE', plan: { planEstudiosId, tipo: 'INDIRECTA' } },
        },
        select: { competenciaId: true },
      }),
      this.prisma.asignaturaEvaluada.findMany({
        where: {
          docenteId: null,
          medicion: { plan: { estado: 'VIGENTE', plan: { planEstudiosId, tipo: 'DIRECTA' } } },
        },
        select: { asignaturaId: true },
      }),
    ]);

    return [
      ...competencias.map((c) => ({ tipo: 'COMPETENCIA' as const, referenciaId: c.competenciaId })),
      ...asignaturas.map((a) => ({ tipo: 'ASIGNATURA' as const, referenciaId: a.asignaturaId })),
    ];
  }
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm run test:integration -- resumen-carrera` → PASS (todas las pruebas).
Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/resumen test/integration/resumen-carrera.int.spec.ts` → sin errores. Si `tsc` protesta porque `aspecto`, `estado` o `estadoImplementacion` de Prisma no encajan con los tipos de `PlanMejoraLeido`, los valores del enum de Prisma son exactamente los mismos literales; ajusta solo el tipo (por ejemplo `as PlanMejoraLeido['estado']`), no la consulta.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/resumen/application/ports/lectura-resumen-carrera.port.ts \
        apps/api/src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.ts \
        apps/api/test/integration/resumen-carrera.int.spec.ts
git commit -m "feat(mejora-continua): puerto de lectura y adaptador Prisma del resumen de carrera"
```

---

### Task 4: Caso de uso `ConsultarResumenDeCarrera`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.spec.ts`

**Interfaces:**
- Consumes: de Task 1 `calcularResumenDeCarrera`, `hoyEnLima`, tipos; de Task 2 `PlanVigenteDeCarreraPort`; de Task 3 `LecturaResumenCarreraPort`; `AuthorizationPort` (`../../../../auth/application/ports/authorization.port.js`); `ContenidoCurricularPort` (`../../../../plan-estudios/application/ports/contenido-curricular.port.js`, métodos `carreraPorId`, `competenciasDelPlan`, `asignaturasDelPlan`); `Actor` (`../../../../../shared-kernel/domain-events/domain-event.js`); `AccesoDenegado`, `ReglaDeNegocioViolada`, `NoEncontrado` (`../../../../../shared-kernel/errors/errores.js`).
- Produces (lo usan Task 5): `ConsultarResumenDeCarrera` con `constructor(lectura, planVigente, contenido, autorizacion, ahora?: () => Date)` y `ejecutar(actor: Actor): Promise<ResumenDeCarrera>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```typescript
// apps/api/src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.spec.ts
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import type { LecturaResumenCarreraPort } from '../ports/lectura-resumen-carrera.port.js';
import { ConsultarResumenDeCarrera } from './consultar-resumen-de-carrera.use-case.js';

const ACTOR: Actor = { id: 'u-director', nombre: 'María Rojas' };
const AHORA = new Date('2026-09-24T15:00:00Z');

function montar(
  opciones: {
    permitido?: boolean;
    carreraACargo?: string | null;
    plan?: { id: string; codigo: string; version: number; fechaVigencia: Date | null } | null;
    carrera?: { id: string; codigo: string; nombre: string } | null;
    ahora?: Date;
  } = {},
) {
  const o = {
    permitido: true,
    carreraACargo: 'c1' as string | null,
    plan: { id: 'pe1', codigo: 'PE-1', version: 1, fechaVigencia: new Date('2026-01-15') },
    carrera: { id: 'c1', codigo: 'ISI', nombre: 'Ingeniería de Sistemas' },
    ahora: AHORA,
    ...opciones,
  };

  const autorizacion: AuthorizationPort = {
    puede: vi.fn(async () =>
      o.permitido ? { permitido: true as const } : { permitido: false as const, motivo: 'no' },
    ),
    permisosDe: vi.fn(async () => new Set<string>()),
    carreraACargoDe: vi.fn(async () => o.carreraACargo),
    rolesDe: vi.fn(async () => []),
  };
  const lectura: LecturaResumenCarreraPort = {
    medicionDirectaVigente: vi.fn(async () => null),
    planesMejoraDeCarrera: vi.fn(async () => []),
    actasPorCerrarDeCarrera: vi.fn(async () => []),
    sinResponsableDe: vi.fn(async () => []),
  };
  const planVigente: PlanVigenteDeCarreraPort = {
    planVigenteDeCarrera: vi.fn(async () => o.plan),
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: vi.fn(async () => []),
    planPorId: vi.fn(async () => null),
    competenciasDelPlan: vi.fn(async () => []),
    asignaturasDelPlan: vi.fn(async () => []),
    carreraPorId: vi.fn(async () => o.carrera),
  };

  const caso = new ConsultarResumenDeCarrera(lectura, planVigente, contenido, autorizacion, () => o.ahora);
  return { caso, autorizacion, lectura, planVigente, contenido };
}

describe('ConsultarResumenDeCarrera', () => {
  it('sin el permiso mejora.leer lanza AccesoDenegado y no consulta nada más', async () => {
    const { caso, autorizacion, lectura, planVigente } = montar({ permitido: false });

    await expect(caso.ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);

    expect(autorizacion.puede).toHaveBeenCalledWith('u-director', 'mejora.leer', null);
    expect(autorizacion.carreraACargoDe).not.toHaveBeenCalled();
    expect(planVigente.planVigenteDeCarrera).not.toHaveBeenCalled();
    expect(lectura.planesMejoraDeCarrera).not.toHaveBeenCalled();
  });

  it('sin carrera a cargo lanza el 409 con el mensaje esperado y no lee datos', async () => {
    const { caso, lectura } = montar({ carreraACargo: null });

    const fallo = await caso.ejecutar(ACTOR).catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta vista necesita una carrera asignada.');
    expect(lectura.planesMejoraDeCarrera).not.toHaveBeenCalled();
  });

  it('si la carrera a cargo ya no existe lanza NoEncontrado', async () => {
    const { caso } = montar({ carrera: null });
    await expect(caso.ejecutar(ACTOR)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('lee siempre de la carrera a cargo del actor', async () => {
    const { caso, lectura, planVigente } = montar({ carreraACargo: 'carrera-del-actor' });

    await caso.ejecutar(ACTOR);

    expect(planVigente.planVigenteDeCarrera).toHaveBeenCalledWith('carrera-del-actor');
    expect(lectura.planesMejoraDeCarrera).toHaveBeenCalledWith('carrera-del-actor');
    expect(lectura.actasPorCerrarDeCarrera).toHaveBeenCalledWith('carrera-del-actor');
  });

  it('sin plan de estudios vigente devuelve plan nulo y no lee mediciones ni evaluación', async () => {
    const { caso, lectura, contenido } = montar({ plan: null });

    const r = await caso.ejecutar(ACTOR);

    expect(r.plan).toBeNull();
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(lectura.medicionDirectaVigente).not.toHaveBeenCalled();
    expect(lectura.sinResponsableDe).not.toHaveBeenCalled();
    expect(contenido.competenciasDelPlan).not.toHaveBeenCalled();
  });

  it('usa la fecha de Lima como hoy: a las 22:00 de Lima un plazo de hoy es POR_VENCER', async () => {
    // 2026-09-25T03:00Z = 24 de septiembre, 22:00 en Lima.
    const { caso, lectura } = montar({ ahora: new Date('2026-09-25T03:00:00Z') });
    vi.mocked(lectura.planesMejoraDeCarrera).mockResolvedValue([
      {
        id: '1',
        codigo: 'PM-1',
        nombre: 'Acción',
        aspecto: 'CRITERIO_ACREDITACION',
        competenciaId: null,
        estado: 'VIGENTE',
        estadoImplementacion: 'PENDIENTE',
        responsable: 'X',
        plazo: new Date('2026-09-24'),
      },
    ]);

    const r = await caso.ejecutar(ACTOR);

    expect(r.planesMejoraAbiertos[0]?.chip).toBe('POR_VENCER');
  });

  it('resuelve los nombres de competencias y asignaturas sin responsable con el puerto curricular', async () => {
    const { caso, lectura, contenido } = montar();
    vi.mocked(lectura.sinResponsableDe).mockResolvedValue([
      { tipo: 'COMPETENCIA', referenciaId: 'k4' },
      { tipo: 'ASIGNATURA', referenciaId: 'a1' },
      { tipo: 'ASIGNATURA', referenciaId: 'desconocida' },
    ]);
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      { id: 'k4', codigo: 'CPE-04', nombre: 'Comunicación efectiva', activa: true, atributos: [] },
    ]);
    vi.mocked(contenido.asignaturasDelPlan).mockResolvedValue([
      { id: 'a1', codigo: 'RC', nombre: 'Redes de Computadoras', cicloNumero: 7, activa: true },
    ]);

    const r = await caso.ejecutar(ACTOR);

    expect(r.pendientes.map((p) => p.texto)).toEqual([
      'Asignar responsable a CPE-04 · Comunicación efectiva',
      'Asignar responsable a Redes de Computadoras',
      // Lo que ya no está en el plan se sigue contando, con un nombre que no engaña.
      'Asignar responsable a una asignatura que ya no está en el plan',
    ]);
    expect(r.mejoraContinua.evaluacionesSinResponsable).toBe(3);
  });

  it('arma las competencias bajo la meta con el nombre que da el puerto curricular', async () => {
    const { caso, lectura, contenido } = montar();
    vi.mocked(lectura.medicionDirectaVigente).mockResolvedValue({
      meta: 0.7,
      periodos: [{ id: 'p1', etiqueta: '2026-10', orden: 1, fechaCierre: null, programadas: 18, realizadas: 12 }],
      resultados: [{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 55 }],
    });
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', activa: true, atributos: [] },
    ]);

    const r = await caso.ejecutar(ACTOR);

    expect(r.kpis).toMatchObject({ medicionesCerradas: 12, medicionesTotal: 18 });
    expect(r.competenciasBajoMeta).toEqual([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', alcanzado: 55, meta: 70 },
    ]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/api`): `npx vitest run src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.spec.ts`
Expected: FAIL — no se puede resolver `consultar-resumen-de-carrera.use-case.js`.

- [ ] **Step 3: Implementar el caso de uso**

```typescript
// apps/api/src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.ts
import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import {
  calcularResumenDeCarrera,
  hoyEnLima,
  type ResumenDeCarrera,
  type SinResponsableLeido,
} from '../../domain/services/resumen-de-carrera.js';
import type {
  LecturaResumenCarreraPort,
  SinResponsableCrudo,
} from '../ports/lectura-resumen-carrera.port.js';

/**
 * Resumen de la carrera para la vista de inicio del Director.
 *
 * La carrera sale siempre de la sesión (`carreraACargoDe`): no hay parámetro que
 * permita mirar la de otro. El permiso se comprueba primero y por completo; sin
 * él no se lee nada, ni siquiera la carrera a cargo.
 */
export class ConsultarResumenDeCarrera {
  constructor(
    private readonly lectura: LecturaResumenCarreraPort,
    private readonly planVigente: PlanVigenteDeCarreraPort,
    private readonly contenido: ContenidoCurricularPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(actor: Actor): Promise<ResumenDeCarrera> {
    const decision = await this.autorizacion.puede(actor.id, 'mejora.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
    if (!carreraId) throw new ReglaDeNegocioViolada('Esta vista necesita una carrera asignada.');

    const [carrera, plan, planesMejora, actas] = await Promise.all([
      this.contenido.carreraPorId(carreraId),
      this.planVigente.planVigenteDeCarrera(carreraId),
      this.lectura.planesMejoraDeCarrera(carreraId),
      this.lectura.actasPorCerrarDeCarrera(carreraId),
    ]);
    if (!carrera) throw new NoEncontrado('la carrera', carreraId);

    const [medicion, competencias, sinResponsable] = plan
      ? await this.delPlan(plan.id)
      : [null, [], [] as SinResponsableLeido[]];

    return calcularResumenDeCarrera({
      hoy: hoyEnLima(this.ahora()),
      carrera: { id: carrera.id, nombre: carrera.nombre },
      plan: plan ? { version: plan.version, fechaVigencia: plan.fechaVigencia } : null,
      medicion,
      competencias: competencias.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
      planesMejora,
      actas,
      sinResponsable,
    });
  }

  private async delPlan(planEstudiosId: string) {
    const [medicion, competencias, asignaturas, crudos] = await Promise.all([
      this.lectura.medicionDirectaVigente(planEstudiosId),
      this.contenido.competenciasDelPlan(planEstudiosId),
      this.contenido.asignaturasDelPlan(planEstudiosId),
      this.lectura.sinResponsableDe(planEstudiosId),
    ]);

    const nombreDeCompetencia = new Map(
      competencias.map((c) => [c.id, `${c.codigo} · ${c.nombre}`]),
    );
    const nombreDeAsignatura = new Map(asignaturas.map((a) => [a.id, a.nombre]));

    const sinResponsable = crudos.map((s: SinResponsableCrudo): SinResponsableLeido => ({
      tipo: s.tipo,
      // Lo que ya no está en el plan se sigue contando: ocultarlo daría un
      // total que no coincide con la realidad de los datos.
      nombre:
        s.tipo === 'COMPETENCIA'
          ? (nombreDeCompetencia.get(s.referenciaId) ?? 'una competencia que ya no está en el plan')
          : (nombreDeAsignatura.get(s.referenciaId) ?? 'una asignatura que ya no está en el plan'),
    }));

    return [medicion, competencias, sinResponsable] as const;
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.spec.ts`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint src/modules/mejora-continua/resumen`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/resumen/application/use-cases/
git commit -m "feat(mejora-continua): caso de uso ConsultarResumenDeCarrera"
```

---

### Task 5: Controller, cableado en `app.module.ts` y prueba de integración ensamblada

**Files:**
- Create: `apps/api/src/modules/mejora-continua/resumen/infrastructure/http/resumen-carrera.controller.ts`
- Modify: `apps/api/src/app.module.ts` (imports arriba; `controllers:` ~línea 364; `providers:` ~línea 405, junto a `CONTENIDO_CURRICULAR` y a la fábrica de `ConsultarEstructuraInstitucional` ~línea 509)
- Test: `apps/api/test/integration/resumen-carrera-caso-de-uso.int.spec.ts`

**Interfaces:**
- Consumes: `ConsultarResumenDeCarrera` (Task 4), `ResumenCarreraRepositoryPrisma` y `LECTURA_RESUMEN_CARRERA` (Task 3), `PlanVigenteAdapter` y `PLAN_VIGENTE_DE_CARRERA` (Task 2), `CONTENIDO_CURRICULAR`, `AUTHORIZATION_PORT`, `ActorActual` (`auth/infrastructure/http/jwt.guard.js`).
- Produces: `GET /mejora-continua/resumen-carrera` (respuesta `ResumenDeCarrera`), que consume el frontend (Task 7).

- [ ] **Step 1: Escribir la prueba de integración ensamblada que falla**

Esta prueba usa los adaptadores **reales** de Prisma y falsea solo la autorización y el puerto curricular. Fija el aislamiento entre carreras (Review Focus 2).

```typescript
// apps/api/test/integration/resumen-carrera-caso-de-uso.int.spec.ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthorizationPort } from '../../src/modules/auth/application/ports/authorization.port.js';
import { ConsultarResumenDeCarrera } from '../../src/modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.js';
import { ResumenCarreraRepositoryPrisma } from '../../src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.js';
import type { ContenidoCurricularPort } from '../../src/modules/plan-estudios/application/ports/contenido-curricular.port.js';
import { PlanVigenteAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();
const ACTOR = { id: 'u-director', nombre: 'María Rojas' };
const AHORA = new Date('2026-09-24T15:00:00Z');

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE academico.facultades, mejora_continua.planes_medicion,
      mejora_continua.planes_mejora, mejora_continua.actas_aprobacion
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function montar(carreraACargo: string | null, permitido = true) {
  const autorizacion: AuthorizationPort = {
    puede: async () => (permitido ? { permitido: true } : { permitido: false, motivo: 'no' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => carreraACargo,
    rolesDe: async () => [],
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: async () => [],
    planPorId: async () => null,
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async (id) => ({ id, codigo: 'ISI', nombre: `Carrera ${id.slice(0, 4)}` }),
  };
  return new ConsultarResumenDeCarrera(
    new ResumenCarreraRepositoryPrisma(prisma),
    new PlanVigenteAdapter(prisma),
    contenido,
    autorizacion,
    () => AHORA,
  );
}

async function carreraConPlan() {
  const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: `C${randomUUID().slice(0, 6)}`, duracionAnios: 5 },
  });
  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: `PE-${randomUUID().slice(0, 8)}`,
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
      fechaVigencia: new Date('2026-01-15'),
    },
  });
  return { carreraId: carrera.id, planId: plan.id };
}

const accion = (carreraId: string, codigo: string) => ({
  codigo,
  aspecto: 'CRITERIO_ACREDITACION' as const,
  carreraId,
  nombre: `Acción ${codigo}`,
  causaRaiz: 'x',
  justificacion: 'x',
  recursos: 'x',
  metas: 'x',
  responsable: 'L. Vidal',
  plazo: new Date('2026-09-26'),
});

describe('ConsultarResumenDeCarrera contra la base real', () => {
  it('sin permiso lanza AccesoDenegado', async () => {
    const { carreraId } = await carreraConPlan();
    await expect(montar(carreraId, false).ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('sin carrera a cargo lanza el 409', async () => {
    await expect(montar(null).ejecutar(ACTOR)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });

  it('un director ve solo los datos de su carrera aunque existan los de otra', async () => {
    const mia = await carreraConPlan();
    const ajena = await carreraConPlan();
    await prisma.planMejora.createMany({
      data: [accion(mia.carreraId, 'PM-MIA'), accion(ajena.carreraId, 'PM-AJENA-1'), accion(ajena.carreraId, 'PM-AJENA-2')],
    });
    await prisma.actaAprobacion.create({
      data: {
        carreraId: ajena.carreraId,
        correlativo: 1,
        codigo: 'ACTA-AJENA',
        periodoAcademico: '2026-10',
        titulo: 't',
        objetivo: 'o',
        convocadaPor: '',
        fechaReunion: new Date(0),
        lugarReunion: '',
        textoIntroduccion: 'i',
        textoAcuerdoCierre: 'c',
      },
    });

    const r = await montar(mia.carreraId).ejecutar(ACTOR);

    expect(r.planesMejoraAbiertos.map((p) => p.codigo)).toEqual(['PM-MIA']);
    expect(r.kpis.planesMejoraAbiertos).toBe(1);
    expect(r.mejoraContinua.actasPorCerrar).toBe(0);
    expect(r.plan).toEqual({ estado: 'VIGENTE', version: 1, anio: 2026 });
  });

  it('una carrera sin plan vigente ni mediciones responde sin fallar', async () => {
    const facultad = await prisma.facultad.create({ data: { nombre: `F-${randomUUID()}` } });
    const carrera = await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Nueva', codigo: `N${randomUUID().slice(0, 6)}`, duracionAnios: 5 },
    });

    const r = await montar(carrera.id).ejecutar(ACTOR);

    expect(r.plan).toBeNull();
    expect(r.kpis).toEqual({
      medicionesCerradas: 0,
      medicionesTotal: 0,
      planesMejoraAbiertos: 0,
      accionesQueVencen: 0,
    });
    expect(r.competenciasBajoMeta).toEqual([]);
    expect(r.pendientes).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:integration -- resumen-carrera-caso-de-uso`
Expected: **PASS**. No hay paso rojo aquí, a propósito: esta prueba no añade código de producción, solo ensambla las piezas de Tasks 1–4 contra la base real, y el controller que viene después no tiene lógica propia (su prueba es el arranque de la aplicación en el Step 5). Si falla, hay un desajuste real entre los adaptadores y el caso de uso que hay que resolver antes de cablear HTTP.

- [ ] **Step 3: Escribir el controller**

```typescript
// apps/api/src/modules/mejora-continua/resumen/infrastructure/http/resumen-carrera.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import { ConsultarResumenDeCarrera } from '../../application/use-cases/consultar-resumen-de-carrera.use-case.js';

@ApiTags('Resumen de carrera')
@ApiBearerAuth()
@Controller('mejora-continua/resumen-carrera')
export class ResumenCarreraController {
  constructor(private readonly consultar: ConsultarResumenDeCarrera) {}

  @Get()
  @ApiOperation({
    summary: 'Resumen de la carrera a cargo (vista de inicio del Director de Carrera)',
    description:
      'Siempre de la carrera que el usuario dirige; no acepta un identificador de carrera.',
  })
  @ApiResponse({ status: 409, description: 'El usuario no tiene una carrera a cargo.' })
  obtener(@ActorActual() actor: Actor) {
    return this.consultar.ejecutar(actor);
  }
}
```

- [ ] **Step 4: Cablear en `app.module.ts`**

Lee el archivo y sigue el estilo de lo que hay. Los cambios son cuatro:

1. **Imports** (junto a los demás de `mejora-continua` y `plan-estudios`):

```typescript
import { PLAN_VIGENTE_DE_CARRERA, type PlanVigenteDeCarreraPort } from './modules/plan-estudios/application/ports/plan-vigente.port.js';
import { PlanVigenteAdapter } from './modules/plan-estudios/infrastructure/plan-vigente.adapter.js';
import { ConsultarResumenDeCarrera } from './modules/mejora-continua/resumen/application/use-cases/consultar-resumen-de-carrera.use-case.js';
import {
  LECTURA_RESUMEN_CARRERA,
  type LecturaResumenCarreraPort,
} from './modules/mejora-continua/resumen/application/ports/lectura-resumen-carrera.port.js';
import { ResumenCarreraRepositoryPrisma } from './modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.js';
import { ResumenCarreraController } from './modules/mejora-continua/resumen/infrastructure/http/resumen-carrera.controller.js';
```

`ContenidoCurricularPort` y `AuthorizationPort` ya están importados para otras fábricas; si `ContenidoCurricularPort` solo se importaba como valor `CONTENIDO_CURRICULAR`, añade también el `type ContenidoCurricularPort` a ese import existente.

2. **`controllers:`** — añade `ResumenCarreraController` junto a `PlanesMejoraController`.

3. **`providers:`** — junto a `{ provide: CONTENIDO_CURRICULAR, … }` añade:

```typescript
    { provide: PLAN_VIGENTE_DE_CARRERA, useClass: PlanVigenteAdapter },
    { provide: LECTURA_RESUMEN_CARRERA, useClass: ResumenCarreraRepositoryPrisma },
```

y, junto a la fábrica de `ConsultarEstructuraInstitucional`, añade:

```typescript
    {
      provide: ConsultarResumenDeCarrera,
      inject: [LECTURA_RESUMEN_CARRERA, PLAN_VIGENTE_DE_CARRERA, CONTENIDO_CURRICULAR, AUTHORIZATION_PORT],
      useFactory: (
        lectura: LecturaResumenCarreraPort,
        planVigente: PlanVigenteDeCarreraPort,
        contenido: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
      ) => new ConsultarResumenDeCarrera(lectura, planVigente, contenido, autorizacion),
    },
```

- [ ] **Step 5: Compilar, arrancar y comprobar**

Run (desde `apps/api`): `npm run build`
Expected: sin errores de TypeScript.

Run: `npm test` (unitarias) → todo en verde, incluida `mejora-continua/aislamiento.spec.ts`.

Run: `npm start` (usa `dist`, no `start:dev`: `tsx` no emite los metadatos que Nest necesita para inyectar por tipo) y comprueba que arranca sin `UndefinedDependencyException`:
Expected en el log: «Nest application successfully started» y la ruta `Mapped {/api/v1/mejora-continua/resumen-carrera, GET}`.
Luego detén el proceso.

Run: `npm run test:integration -- resumen-carrera` → PASS (las dos suites de este plan).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/resumen/infrastructure/http/resumen-carrera.controller.ts \
        apps/api/src/app.module.ts \
        apps/api/test/integration/resumen-carrera-caso-de-uso.int.spec.ts
git commit -m "feat(mejora-continua): GET /mejora-continua/resumen-carrera y su cableado"
```

---

### Task 6: `TarjetaDeAccion` compartida y `AccionRecomendada` sobre ella

**Files:**
- Modify: `apps/web/src/shared/components/ui/index.tsx` (añadir tras `ReportBridgeCard`, al final del archivo)
- Modify: `apps/web/src/features/dashboard/components/AccionRecomendada.tsx`
- Test: `apps/web/src/shared/components/ui/TarjetaDeAccion.test.tsx`
- Sin cambios (deben seguir pasando): `apps/web/src/features/dashboard/components/AccionRecomendada.test.tsx`

**Interfaces:**
- Consumes: `Link` (ya importado en `ui/index.tsx`), `cn` (`@/shared/lib/cn`, ya importado).
- Produces (lo usan Task 8 y, después, la vista del Docente): `TarjetaDeAccion` con props `{ etiqueta: string; titulo: string; descripcion: string; boton: { texto: string; href: string }; className?: string }`.

- [ ] **Step 1: Escribir la prueba que falla**

```tsx
// apps/web/src/shared/components/ui/TarjetaDeAccion.test.tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TarjetaDeAccion } from './index';

const montar = () =>
  render(
    <MemoryRouter>
      <TarjetaDeAccion
        etiqueta="Acción recomendada"
        titulo="2 competencias por debajo de la meta"
        descripcion="Comunicación efectiva y Trabajo en equipo requieren un plan de mejora."
        boton={{ texto: 'Crear plan de mejora', href: '/mejora-continua/mejora' }}
      />
    </MemoryRouter>,
  );

describe('TarjetaDeAccion', () => {
  it('muestra la etiqueta, el título y la descripción', () => {
    montar();
    expect(screen.getByText('Acción recomendada')).toBeInTheDocument();
    expect(screen.getByText('2 competencias por debajo de la meta')).toBeInTheDocument();
    expect(
      screen.getByText('Comunicación efectiva y Trabajo en equipo requieren un plan de mejora.'),
    ).toBeInTheDocument();
  });

  it('su botón es un enlace al destino indicado', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Crear plan de mejora' })).toHaveAttribute(
      'href',
      '/mejora-continua/mejora',
    );
  });

  it('el botón tiene indicador de foco visible sobre el fondo morado', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Crear plan de mejora' })).toHaveClass(
      'focus-visible:outline-white',
    );
  });

  it('es una región con nombre, para lectores de pantalla', () => {
    montar();
    expect(screen.getByRole('region', { name: 'Acción recomendada' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/web`): `npx vitest run src/shared/components/ui/TarjetaDeAccion.test.tsx`
Expected: FAIL — `TarjetaDeAccion` no se exporta de `./index`.

- [ ] **Step 3: Añadir el componente**

Al final de `apps/web/src/shared/components/ui/index.tsx`, tras `ReportBridgeCard`:

```tsx
/* ── Tarjeta de acción destacada ──────────────────────────────────────── */

/**
 * La tarjeta morada de «lo más útil ahora mismo»: una etiqueta, un título, una
 * frase y un solo botón. La usan la vista del Administrador («Acción
 * recomendada»), la del Director y la del Docente («Vence pronto»).
 *
 * Los colores son los del degradado de `ResumenGenerico`; no hay ninguno nuevo.
 */
export function TarjetaDeAccion({
  etiqueta,
  titulo,
  descripcion,
  boton,
  className,
}: {
  etiqueta: string;
  titulo: string;
  descripcion: string;
  boton: { texto: string; href: string };
  className?: string;
}) {
  return (
    <section
      aria-label={etiqueta}
      className={cn(
        'relative overflow-hidden rounded-2xl bg-gradient-to-br from-uc-primary via-uc-v1 to-uc-dark p-6',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-uc-v2 opacity-30"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">{etiqueta}</p>
          <p className="mt-1 text-lg font-semibold">{titulo}</p>
          <p className="text-sm">{descripcion}</p>
        </div>
        <Link
          to={boton.href}
          className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-uc-primary transition hover:brightness-95 focus-visible:outline-white"
        >
          {boton.texto}
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/shared/components/ui/TarjetaDeAccion.test.tsx`
Expected: PASS (4 pruebas).

- [ ] **Step 5: Hacer que `AccionRecomendada` use la tarjeta compartida**

Reemplaza el `return` de `AccionRecomendada` (todo el `<section>…</section>`) y sus imports. El archivo queda así, conservando `nombresDe`, `NOMBRADAS` e `plural`:

```tsx
/**
 * La acción más útil ahora mismo en la vista del Administrador: asignar director
 * a las carreras que no lo tienen. Compone la `TarjetaDeAccion` compartida.
 */

import { TarjetaDeAccion } from '@/shared/components/ui';

import { plural } from '../domain/vista-admin';

interface Props {
  readonly carreras: readonly { id: string; nombre: string }[];
}

const NOMBRADAS = 2;

function nombresDe(carreras: Props['carreras']): string {
  const nombres = carreras
    .slice(0, NOMBRADAS)
    .map((c) => c.nombre)
    .join(', ');
  const resto = carreras.length - NOMBRADAS;
  return resto > 0 ? `${nombres} y ${resto} más` : nombres;
}

export function AccionRecomendada({ carreras }: Props) {
  if (carreras.length === 0) return null;

  return (
    <TarjetaDeAccion
      etiqueta="Acción recomendada"
      titulo={`${plural(carreras.length, 'carrera', 'carreras')} sin director asignado`}
      descripcion={nombresDe(carreras)}
      boton={{ texto: 'Asignar responsables', href: '/usuarios' }}
    />
  );
}
```

- [ ] **Step 6: Verificar que Admin sigue igual**

Run: `npx vitest run src/features/dashboard src/shared/components/ui`
Expected: PASS, en particular las 6 pruebas de `AccionRecomendada.test.tsx` **sin haberlas modificado** (texto exacto, `href="/usuarios"` y la clase `focus-visible:outline-white`).
Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/shared/components/ui src/features/dashboard` → sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/components/ui/index.tsx \
        apps/web/src/shared/components/ui/TarjetaDeAccion.test.tsx \
        apps/web/src/features/dashboard/components/AccionRecomendada.tsx
git commit -m "feat(dashboard): TarjetaDeAccion compartida; AccionRecomendada la usa"
```

---

### Task 7: Cliente de la API y traductores de la vista del Director

**Files:**
- Create: `apps/web/src/features/dashboard/api/resumen-carrera.api.ts`
- Create: `apps/web/src/features/dashboard/domain/vista-director.ts`
- Test: `apps/web/src/features/dashboard/domain/vista-director.test.ts`

**Interfaces:**
- Consumes: `cliente` (`@/shared/api/cliente`); `plural` de `./vista-admin`; tipos `FilaDataPanel`, `ItemPendiente`, `TarjetaSecundaria` de `@/shared/components/ui`.
- Produces (los usa Task 8):
  - De `resumen-carrera.api.ts`: tipos `ChipPlan`, `AspectoMejora`, `PlanMejoraAbierto`, `CompetenciaBajoMeta`, `Pendiente`, `ResumenDeCarrera`; función `obtenerResumenDeCarrera(): Promise<ResumenDeCarrera>`.
  - De `vista-director.ts`: `filaDePlanMejora(p): FilaDataPanel`, `pendientesDe(r): ItemPendiente[]`, `tarjetasDeMejoraContinua(r): TarjetaSecundaria[]`, `descripcionBajoMeta(competencias, periodo): string`, `subtituloDe(r): string`, `valorEstadoDelPlan(r): string`, `fechaCorta(iso: string): string`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```typescript
// apps/web/src/features/dashboard/domain/vista-director.test.ts
import { describe, expect, it } from 'vitest';

import type { ResumenDeCarrera } from '../api/resumen-carrera.api';
import {
  descripcionBajoMeta,
  fechaCorta,
  filaDePlanMejora,
  pendientesDe,
  subtituloDe,
  tarjetasDeMejoraContinua,
  valorEstadoDelPlan,
} from './vista-director';

const base: ResumenDeCarrera = {
  carrera: { id: 'c1', nombre: 'Ingeniería de Sistemas e Informática' },
  plan: { estado: 'VIGENTE', version: 1, anio: 2026 },
  kpis: { medicionesCerradas: 12, medicionesTotal: 18, planesMejoraAbiertos: 5, accionesQueVencen: 2 },
  planesMejoraAbiertos: [],
  competenciasBajoMeta: [],
  pendientes: [],
  mejoraContinua: {
    periodoMedicion: '2026-10',
    evaluacionesSinResponsable: 2,
    planesMejoraAbiertos: 5,
    actasPorCerrar: 1,
  },
};

describe('fechaCorta', () => {
  it('formatea AAAA-MM-DD como «día mes» en español, sin depender de la zona horaria', () => {
    expect(fechaCorta('2026-09-30')).toBe('30 sep');
    expect(fechaCorta('2026-10-05')).toBe('5 oct');
    expect(fechaCorta('2026-01-01')).toBe('1 ene');
  });
});

describe('filaDePlanMejora', () => {
  const plan = {
    id: 'p1',
    codigo: 'PM-011',
    nombre: 'Actualizar rúbrica de proyectos finales',
    aspecto: 'COMPETENCIA' as const,
    responsable: 'L. Vidal',
    plazo: '2026-09-30',
    estadoImplementacion: 'EN_PROCESO' as const,
    progreso: 50 as const,
    chip: 'EN_PROCESO' as const,
  };

  it('arma el tag, el título, la meta con aspecto, responsable y plazo, y el enlace', () => {
    expect(filaDePlanMejora(plan)).toEqual({
      id: 'p1',
      tag: 'PM-011',
      titulo: 'Actualizar rúbrica de proyectos finales',
      meta: 'Competencia · L. Vidal · vence 30 sep',
      progreso: 50,
      chip: { texto: 'En proceso', tono: 'encurso' },
      href: '/mejora-continua/mejora',
    });
  });

  it.each([
    ['INICIANDO', 'Iniciando', 'inactivo'],
    ['EN_PROCESO', 'En proceso', 'encurso'],
    ['POR_VENCER', 'Por vencer', 'progreso'],
    ['VENCIDA', 'Vencida', 'progreso'],
  ] as const)('el chip %s se muestra como «%s»', (chip, texto, tono) => {
    expect(filaDePlanMejora({ ...plan, chip }).chip).toEqual({ texto, tono });
  });

  it.each([
    ['CRITERIO_ACREDITACION', 'Criterio'],
    ['OBJETIVO_EDUCACIONAL', 'Objetivo'],
    ['COMPETENCIA', 'Competencia'],
  ] as const)('el aspecto %s se muestra como «%s»', (aspecto, etiqueta) => {
    expect(filaDePlanMejora({ ...plan, aspecto }).meta).toMatch(new RegExp(`^${etiqueta} ·`));
  });
});

describe('pendientesDe', () => {
  it('traduce cada pendiente con su enlace y la urgencia', () => {
    const r = {
      ...base,
      pendientes: [
        { tipo: 'APROBAR_PLANES' as const, texto: 'Aprobar 2 planes de mejora enviados', detalle: 'PM-011, PM-012', urgente: true },
        { tipo: 'CERRAR_ACTA' as const, texto: 'Cerrar acta ACTA N° 001', detalle: 'En borrador', urgente: false },
        { tipo: 'ASIGNAR_RESPONSABLE' as const, texto: 'Asignar responsable a X', detalle: 'Competencia sin responsable', urgente: false },
      ],
    };
    expect(pendientesDe(r)).toEqual([
      { id: 'APROBAR_PLANES-0', texto: 'Aprobar 2 planes de mejora enviados · PM-011, PM-012', urgente: true, href: '/mejora-continua/mejora' },
      { id: 'CERRAR_ACTA-1', texto: 'Cerrar acta ACTA N° 001 · En borrador', urgente: false, href: '/mejora-continua/actas' },
      { id: 'ASIGNAR_RESPONSABLE-2', texto: 'Asignar responsable a X · Competencia sin responsable', urgente: false, href: '/mejora-continua/evaluacion' },
    ]);
  });

  it('sin pendientes devuelve una lista vacía', () => {
    expect(pendientesDe(base)).toEqual([]);
  });
});

describe('tarjetasDeMejoraContinua', () => {
  it('arma las cuatro tarjetas con su enlace y su detalle', () => {
    expect(tarjetasDeMejoraContinua(base)).toEqual([
      { id: 'medicion', titulo: 'Medición', valor: 'Planes de Medición', detalle: 'Periodo 2026-10', href: '/mejora-continua/medicion' },
      { id: 'evaluacion', titulo: 'Evaluación', valor: 'Planes de Evaluación', detalle: '2 sin responsable', href: '/mejora-continua/evaluacion' },
      { id: 'mejora', titulo: 'Mejora', valor: 'Planes de Mejora', detalle: '5 abiertos', href: '/mejora-continua/mejora' },
      { id: 'cierre', titulo: 'Cierre', valor: 'Aprobaciones y actas', detalle: '1 acta por cerrar', href: '/mejora-continua/actas' },
    ]);
  });

  it('con todo al día lo dice, y sin periodo lo dice', () => {
    const r = {
      ...base,
      mejoraContinua: { periodoMedicion: null, evaluacionesSinResponsable: 0, planesMejoraAbiertos: 1, actasPorCerrar: 0 },
    };
    const t = tarjetasDeMejoraContinua(r);
    expect(t[0]?.detalle).toBe('Sin periodo');
    expect(t[1]?.detalle).toBe('Todo asignado');
    expect(t[2]?.detalle).toBe('1 abierto');
    expect(t[3]?.detalle).toBe('Sin actas por cerrar');
  });
});

describe('descripcionBajoMeta', () => {
  const c = (nombre: string) => ({ id: nombre, codigo: 'X', nombre, alcanzado: 50, meta: 70 });

  it('con una competencia usa el singular', () => {
    expect(descripcionBajoMeta([c('Comunicación efectiva')], '2026-10')).toBe(
      'Comunicación efectiva requiere un plan de mejora para el periodo 2026-10.',
    );
  });

  it('con dos las nombra con «y»', () => {
    expect(descripcionBajoMeta([c('Comunicación efectiva'), c('Trabajo en equipo')], '2026-10')).toBe(
      'Comunicación efectiva y Trabajo en equipo requieren un plan de mejora para el periodo 2026-10.',
    );
  });

  it('con más de dos nombra las dos primeras y cuenta el resto', () => {
    expect(descripcionBajoMeta([c('A'), c('B'), c('C'), c('D')], null)).toBe(
      'A, B y 2 más requieren un plan de mejora.',
    );
  });
});

describe('subtituloDe y valorEstadoDelPlan', () => {
  it('con plan vigente resume el plan, los planes abiertos y las acciones que vencen', () => {
    expect(subtituloDe(base)).toBe(
      'Plan de estudios 2026 vigente. Tienes 5 planes de mejora abiertos y 2 acciones por vencer o vencidas.',
    );
    expect(valorEstadoDelPlan(base)).toBe('Vigente v1 · 2026');
  });

  it('usa el singular', () => {
    const r = { ...base, kpis: { ...base.kpis, planesMejoraAbiertos: 1, accionesQueVencen: 1 } };
    expect(subtituloDe(r)).toBe(
      'Plan de estudios 2026 vigente. Tienes 1 plan de mejora abierto y 1 acción por vencer o vencida.',
    );
  });

  it('sin plan vigente lo dice', () => {
    const r = { ...base, plan: null };
    expect(subtituloDe(r)).toBe('Esta carrera no tiene un plan de estudios vigente.');
    expect(valorEstadoDelPlan(r)).toBe('Sin plan vigente');
  });

  it('sin año no inventa uno', () => {
    const r = { ...base, plan: { estado: 'VIGENTE' as const, version: 3, anio: null } };
    expect(valorEstadoDelPlan(r)).toBe('Vigente v3');
    expect(subtituloDe(r)).toMatch(/^Plan de estudios vigente\./);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/web`): `npx vitest run src/features/dashboard/domain/vista-director.test.ts`
Expected: FAIL — no se puede resolver `../api/resumen-carrera.api` ni `./vista-director`.

- [ ] **Step 3: Escribir el cliente**

```typescript
// apps/web/src/features/dashboard/api/resumen-carrera.api.ts
import { cliente } from '@/shared/api/cliente';

export type ChipPlan = 'INICIANDO' | 'EN_PROCESO' | 'POR_VENCER' | 'VENCIDA';
export type AspectoMejora = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';

export interface PlanMejoraAbierto {
  id: string;
  codigo: string;
  nombre: string;
  aspecto: AspectoMejora;
  responsable: string;
  /** `AAAA-MM-DD`. */
  plazo: string;
  estadoImplementacion: 'PENDIENTE' | 'EN_PROCESO';
  progreso: 0 | 50;
  chip: ChipPlan;
}

export interface CompetenciaBajoMeta {
  id: string;
  codigo: string;
  nombre: string;
  alcanzado: number;
  meta: number;
}

export interface Pendiente {
  tipo: 'APROBAR_PLANES' | 'CERRAR_ACTA' | 'ASIGNAR_RESPONSABLE';
  texto: string;
  detalle: string;
  urgente: boolean;
}

export interface ResumenDeCarrera {
  carrera: { id: string; nombre: string };
  plan: { estado: 'VIGENTE'; version: number; anio: number | null } | null;
  kpis: {
    medicionesCerradas: number;
    medicionesTotal: number;
    planesMejoraAbiertos: number;
    accionesQueVencen: number;
  };
  planesMejoraAbiertos: PlanMejoraAbierto[];
  competenciasBajoMeta: CompetenciaBajoMeta[];
  pendientes: Pendiente[];
  mejoraContinua: {
    periodoMedicion: string | null;
    evaluacionesSinResponsable: number;
    planesMejoraAbiertos: number;
    actasPorCerrar: number;
  };
}

export function obtenerResumenDeCarrera(): Promise<ResumenDeCarrera> {
  return cliente.get<ResumenDeCarrera>('/mejora-continua/resumen-carrera');
}
```

- [ ] **Step 4: Escribir los traductores**

```typescript
// apps/web/src/features/dashboard/domain/vista-director.ts
/**
 * Traducciones de la respuesta de `/mejora-continua/resumen-carrera` a las props
 * de los componentes de Fase 0e. Funciones puras: la página solo las compone.
 * La respuesta ya llega ordenada y recortada; aquí no se ordena ni se recorta.
 */

import type { FilaDataPanel, ItemPendiente, TarjetaSecundaria } from '@/shared/components/ui';

import type {
  AspectoMejora,
  ChipPlan,
  CompetenciaBajoMeta,
  Pendiente,
  PlanMejoraAbierto,
  ResumenDeCarrera,
} from '../api/resumen-carrera.api';
import { plural } from './vista-admin';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-09-30` → `30 sep`. A mano: `toLocaleDateString` depende del ICU de cada entorno. */
export function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? ''}`;
}

const ASPECTO: Record<AspectoMejora, string> = {
  CRITERIO_ACREDITACION: 'Criterio',
  OBJETIVO_EDUCACIONAL: 'Objetivo',
  COMPETENCIA: 'Competencia',
};

// «Vencida» y «Por vencer» comparten el tono ámbar: no hay un tono rojo entre
// los de `Badge` y no se inventan colores. Lo que las distingue es el texto.
const CHIP: Record<ChipPlan, NonNullable<FilaDataPanel['chip']>> = {
  INICIANDO: { texto: 'Iniciando', tono: 'inactivo' },
  EN_PROCESO: { texto: 'En proceso', tono: 'encurso' },
  POR_VENCER: { texto: 'Por vencer', tono: 'progreso' },
  VENCIDA: { texto: 'Vencida', tono: 'progreso' },
};

export function filaDePlanMejora(p: PlanMejoraAbierto): FilaDataPanel {
  return {
    id: p.id,
    tag: p.codigo,
    titulo: p.nombre,
    meta: `${ASPECTO[p.aspecto]} · ${p.responsable} · vence ${fechaCorta(p.plazo)}`,
    progreso: p.progreso,
    chip: CHIP[p.chip],
    href: '/mejora-continua/mejora',
  };
}

const DESTINO_PENDIENTE: Record<Pendiente['tipo'], string> = {
  APROBAR_PLANES: '/mejora-continua/mejora',
  CERRAR_ACTA: '/mejora-continua/actas',
  ASIGNAR_RESPONSABLE: '/mejora-continua/evaluacion',
};

export function pendientesDe(r: ResumenDeCarrera): ItemPendiente[] {
  return r.pendientes.map((p, i) => ({
    id: `${p.tipo}-${i}`,
    texto: `${p.texto} · ${p.detalle}`,
    urgente: p.urgente,
    href: DESTINO_PENDIENTE[p.tipo],
  }));
}

export function tarjetasDeMejoraContinua(r: ResumenDeCarrera): TarjetaSecundaria[] {
  const m = r.mejoraContinua;
  return [
    {
      id: 'medicion',
      titulo: 'Medición',
      valor: 'Planes de Medición',
      detalle: m.periodoMedicion ? `Periodo ${m.periodoMedicion}` : 'Sin periodo',
      href: '/mejora-continua/medicion',
    },
    {
      id: 'evaluacion',
      titulo: 'Evaluación',
      valor: 'Planes de Evaluación',
      detalle:
        m.evaluacionesSinResponsable === 0
          ? 'Todo asignado'
          : `${m.evaluacionesSinResponsable} sin responsable`,
      href: '/mejora-continua/evaluacion',
    },
    {
      id: 'mejora',
      titulo: 'Mejora',
      valor: 'Planes de Mejora',
      detalle: plural(m.planesMejoraAbiertos, 'abierto', 'abiertos'),
      href: '/mejora-continua/mejora',
    },
    {
      id: 'cierre',
      titulo: 'Cierre',
      valor: 'Aprobaciones y actas',
      detalle:
        m.actasPorCerrar === 0
          ? 'Sin actas por cerrar'
          : plural(m.actasPorCerrar, 'acta por cerrar', 'actas por cerrar'),
      href: '/mejora-continua/actas',
    },
  ];
}

const NOMBRADAS = 2;

export function descripcionBajoMeta(
  competencias: readonly CompetenciaBajoMeta[],
  periodo: string | null,
): string {
  const nombres = competencias.slice(0, NOMBRADAS).map((c) => c.nombre);
  const resto = competencias.length - NOMBRADAS;
  const lista =
    resto > 0
      ? `${nombres.join(', ')} y ${resto} más`
      : nombres.join(' y ');
  const verbo = competencias.length === 1 ? 'requiere' : 'requieren';
  return `${lista} ${verbo} un plan de mejora${periodo ? ` para el periodo ${periodo}` : ''}.`;
}

export function valorEstadoDelPlan(r: ResumenDeCarrera): string {
  if (!r.plan) return 'Sin plan vigente';
  return `Vigente v${r.plan.version}${r.plan.anio ? ` · ${r.plan.anio}` : ''}`;
}

export function subtituloDe(r: ResumenDeCarrera): string {
  if (!r.plan) return 'Esta carrera no tiene un plan de estudios vigente.';
  const cabecera = r.plan.anio
    ? `Plan de estudios ${r.plan.anio} vigente.`
    : 'Plan de estudios vigente.';
  const planes = `${plural(r.kpis.planesMejoraAbiertos, 'plan de mejora abierto', 'planes de mejora abiertos')}`;
  const acciones =
    r.kpis.accionesQueVencen === 1
      ? '1 acción por vencer o vencida'
      : `${r.kpis.accionesQueVencen} acciones por vencer o vencidas`;
  return `${cabecera} Tienes ${planes} y ${acciones}.`;
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run src/features/dashboard/domain/vista-director.test.ts`
Expected: PASS. Si `descripcionBajoMeta` con dos competencias falla por el orden `y`/coma, revisa que con `resto = 0` se usa `join(' y ')` y con más de dos `join(', ')` seguido de ` y N más`.
Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/features/dashboard` → sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/dashboard/api/resumen-carrera.api.ts \
        apps/web/src/features/dashboard/domain/vista-director.ts \
        apps/web/src/features/dashboard/domain/vista-director.test.ts
git commit -m "feat(dashboard): cliente de resumen de carrera y traductores de la vista del Director"
```

---

### Task 8: `VistaDirectorInicio` y ajuste de `ResumenPage.test.tsx`

**Files:**
- Modify: `apps/web/src/features/dashboard/pages/VistaDirectorInicio.tsx` (reemplazo completo del stub)
- Modify: `apps/web/src/features/dashboard/pages/ResumenPage.test.tsx` (la prueba `DIRECTOR_CARRERA`)
- Test: `apps/web/src/features/dashboard/pages/VistaDirectorInicio.test.tsx`

**Interfaces:**
- Consumes: de Task 7 `obtenerResumenDeCarrera`, tipo `ResumenDeCarrera` y los traductores; de Task 6 `TarjetaDeAccion`; `useSesion` (`@/features/auth/hooks/contexto-sesion`, campo `identidad.carreraACargo: string | null`); `ErrorDeNegocio` (`@/shared/api/cliente`, campo `estado: number`); `Boton`, `DataPanel`, `KpiCard`, `PendingList`, `ReportBridgeCard`, `SecondaryCardGrid` de `@/shared/components/ui`.
- Produces: `VistaDirectorInicio` (sin props), usada por `ResumenPage` sin cambios en el despachador.

- [ ] **Step 1: Escribir las pruebas de la vista, que fallan**

```tsx
// apps/web/src/features/dashboard/pages/VistaDirectorInicio.test.tsx
/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/resumen-carrera.api';
import type { ResumenDeCarrera } from '../api/resumen-carrera.api';
import { VistaDirectorInicio } from './VistaDirectorInicio';

const completo: ResumenDeCarrera = {
  carrera: { id: 'c1', nombre: 'Ingeniería de Sistemas e Informática' },
  plan: { estado: 'VIGENTE', version: 1, anio: 2026 },
  kpis: { medicionesCerradas: 12, medicionesTotal: 18, planesMejoraAbiertos: 5, accionesQueVencen: 2 },
  planesMejoraAbiertos: [
    {
      id: 'p1',
      codigo: 'PM-011',
      nombre: 'Actualizar rúbrica de proyectos finales',
      aspecto: 'COMPETENCIA',
      responsable: 'L. Vidal',
      plazo: '2026-09-30',
      estadoImplementacion: 'EN_PROCESO',
      progreso: 50,
      chip: 'EN_PROCESO',
    },
    {
      id: 'p2',
      codigo: 'PM-014',
      nombre: 'Ampliar encuesta a egresados',
      aspecto: 'CRITERIO_ACREDITACION',
      responsable: 'J. Huamán',
      plazo: '2026-09-10',
      estadoImplementacion: 'PENDIENTE',
      progreso: 0,
      chip: 'VENCIDA',
    },
  ],
  competenciasBajoMeta: [
    { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', alcanzado: 55, meta: 70 },
    { id: 'k2', codigo: 'CPE-02', nombre: 'Trabajo en equipo', alcanzado: 60, meta: 70 },
  ],
  pendientes: [
    { tipo: 'APROBAR_PLANES', texto: 'Aprobar 4 planes de mejora enviados', detalle: 'PM-011, PM-012', urgente: true },
  ],
  mejoraContinua: { periodoMedicion: '2026-10', evaluacionesSinResponsable: 2, planesMejoraAbiertos: 5, actasPorCerrar: 1 },
};

const limpio: ResumenDeCarrera = {
  ...completo,
  planesMejoraAbiertos: [],
  competenciasBajoMeta: [],
  pendientes: [],
  kpis: { medicionesCerradas: 0, medicionesTotal: 0, planesMejoraAbiertos: 0, accionesQueVencen: 0 },
  mejoraContinua: { periodoMedicion: null, evaluacionesSinResponsable: 0, planesMejoraAbiertos: 0, actasPorCerrar: 0 },
};

const sesion = (carreraACargo: string | null): ValorSesion => ({
  identidad: { id: 'u1', nombre: 'María Rojas', permisos: [], roles: ['DIRECTOR_CARRERA'], carreraACargo },
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: ['DIRECTOR_CARRERA'],
  vistaActiva: 'DIRECTOR_CARRERA',
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
});

function montar(carreraACargo: string | null = 'c1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ContextoSesion.Provider value={sesion(carreraACargo)}>
          <VistaDirectorInicio />
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('VistaDirectorInicio', () => {
  it('con datos completos muestra la carrera, el subtítulo, los KPIs y las secciones', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(completo);
    montar();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ingeniería de Sistemas e Informática' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Plan de estudios 2026 vigente\. Tienes 5 planes de mejora abiertos/),
    ).toBeInTheDocument();
    expect(screen.getByText('Vigente v1 · 2026')).toBeInTheDocument();
    expect(screen.getByText('12 de 18 cerradas')).toBeInTheDocument();
    expect(screen.getByText('Actualizar rúbrica de proyectos finales')).toBeInTheDocument();
    expect(screen.getByText('Aprobar 4 planes de mejora enviados · PM-011, PM-012')).toBeInTheDocument();
    expect(screen.getByText('Planes de Medición')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Resultados vs\. meta|Reportes/ })).toBeInTheDocument();
  });

  it('con competencias bajo la meta muestra la tarjeta de acción con su botón', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(completo);
    montar();

    expect(await screen.findByText('2 competencias por debajo de la meta')).toBeInTheDocument();
    expect(
      screen.getByText(/Comunicación efectiva y Trabajo en equipo requieren un plan de mejora para el periodo 2026-10/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear plan de mejora' })).toHaveAttribute(
      'href',
      '/mejora-continua/mejora',
    );
  });

  it('sin competencias bajo la meta la tarjeta de acción no aparece', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(limpio);
    montar();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Acción recomendada' })).not.toBeInTheDocument();
  });

  it('sin planes abiertos ni pendientes muestra los estados vacíos', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue(limpio);
    montar();

    expect(await screen.findByText('No hay planes de mejora abiertos.')).toBeInTheDocument();
    expect(screen.getByText('No hay pendientes de decisión.')).toBeInTheDocument();
  });

  it('sin plan de estudios vigente lo dice en el subtítulo y en el KPI', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockResolvedValue({ ...limpio, plan: null });
    montar();

    expect(await screen.findByText('Esta carrera no tiene un plan de estudios vigente.')).toBeInTheDocument();
    expect(screen.getByText('Sin plan vigente')).toBeInTheDocument();
  });

  it('sin carrera a cargo no llama al endpoint y muestra el mensaje con un enlace a Usuarios', () => {
    const espia = vi.spyOn(api, 'obtenerResumenDeCarrera');
    montar(null);

    expect(screen.getByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Usuarios' })).toHaveAttribute('href', '/usuarios');
    expect(espia).not.toHaveBeenCalled();
  });

  it('si el endpoint responde 409 muestra el mismo mensaje de carrera asignada', async () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockRejectedValue(
      new ErrorDeNegocio('Esta vista necesita una carrera asignada.', 409),
    );
    montar();

    expect(await screen.findByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.spyOn(api, 'obtenerResumenDeCarrera').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByRole('status', { name: 'Cargando resumen de la carrera' })).toBeInTheDocument();
  });

  it('ante un fallo de red muestra el error con reintento, y reintentar vuelve a pedir', async () => {
    const espia = vi
      .spyOn(api, 'obtenerResumenDeCarrera')
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce(completo);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el resumen de la carrera.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingeniería de Sistemas e Informática' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run (desde `apps/web`): `npx vitest run src/features/dashboard/pages/VistaDirectorInicio.test.tsx`
Expected: FAIL — el stub actual no renderiza el encabezado ni llama al endpoint.

- [ ] **Step 3: Reemplazar el stub por la vista**

```tsx
// apps/web/src/features/dashboard/pages/VistaDirectorInicio.tsx
/**
 * Vista de inicio del Director de Carrera (`DIRECTOR_CARRERA`).
 *
 * Todo sale de una sola consulta a `/mejora-continua/resumen-carrera`; el cálculo
 * vive en el backend (`calcularResumenDeCarrera`) y la traducción a props en
 * `domain/vista-director.ts`. Esta página solo compone.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Boton,
  DataPanel,
  KpiCard,
  PendingList,
  ReportBridgeCard,
  SecondaryCardGrid,
  TarjetaDeAccion,
} from '@/shared/components/ui';

import { obtenerResumenDeCarrera } from '../api/resumen-carrera.api';
import {
  descripcionBajoMeta,
  filaDePlanMejora,
  pendientesDe,
  subtituloDe,
  tarjetasDeMejoraContinua,
  valorEstadoDelPlan,
} from '../domain/vista-director';
import { plural } from '../domain/vista-admin';

/** Mismas proporciones que la vista cargada, para que no salte de tamaño. */
function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div role="status" aria-label="Cargando resumen de la carrera" className="space-y-6">
      <div className={`${bloque} h-16`} />
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

export function VistaDirectorInicio() {
  const { identidad } = useSesion();
  const carreraACargo = identidad?.carreraACargo ?? null;

  const consulta = useQuery({
    queryKey: ['resumen-carrera', carreraACargo],
    queryFn: obtenerResumenDeCarrera,
    enabled: carreraACargo !== null,
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
        <p className="text-sm text-tinta">No se pudo cargar el resumen de la carrera.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const r = consulta.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">{r.carrera.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-suave">{subtituloDe(r)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard etiqueta="Estado del plan" valor={valorEstadoDelPlan(r)} />
        <KpiCard
          etiqueta="Mediciones del periodo"
          valor={`${r.kpis.medicionesCerradas} de ${r.kpis.medicionesTotal} cerradas`}
        />
        <KpiCard etiqueta="Planes de mejora" valor={r.kpis.planesMejoraAbiertos} />
        <KpiCard etiqueta="Por vencer o vencidas" valor={r.kpis.accionesQueVencen} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="space-y-2">
            <DataPanel
              titulo="Planes de mejora abiertos"
              filas={r.planesMejoraAbiertos.map(filaDePlanMejora)}
              vacio="No hay planes de mejora abiertos."
            />
            <Link to="/mejora-continua/mejora" className="text-sm font-semibold text-uc-primary">
              Ver todo
            </Link>
          </div>

          <section aria-labelledby="dentro-de-mejora-continua" className="space-y-3">
            <h2 id="dentro-de-mejora-continua" className="text-sm font-semibold text-tinta">
              Dentro de Mejora Continua
            </h2>
            <SecondaryCardGrid items={tarjetasDeMejoraContinua(r)} />
          </section>
        </div>

        <div className="space-y-6">
          {r.competenciasBajoMeta.length > 0 && (
            <TarjetaDeAccion
              etiqueta="Acción recomendada"
              titulo={`${plural(r.competenciasBajoMeta.length, 'competencia', 'competencias')} por debajo de la meta`}
              descripcion={descripcionBajoMeta(r.competenciasBajoMeta, r.mejoraContinua.periodoMedicion)}
              boton={{ texto: 'Crear plan de mejora', href: '/mejora-continua/mejora' }}
            />
          )}
          <PendingList
            titulo="Pendientes de tu decisión"
            items={pendientesDe(r)}
            vacio="No hay pendientes de decisión."
          />
          <ReportBridgeCard
            titulo="Resultados vs. meta y cobertura"
            descripcion="El detalle por competencia, criterio y periodo vive en Reportes."
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar que pasa la vista**

Run: `npx vitest run src/features/dashboard/pages/VistaDirectorInicio.test.tsx`
Expected: PASS (9 pruebas). Dos comprobaciones si algo no cuadra:
- `plural` se importa de `../domain/vista-admin` (ya exportada).
- La prueba del enlace a Reportes usa la expresión `/Resultados vs\. meta|Reportes/`: `ReportBridgeCard` tiene el destino `/reportes` fijo, así que el enlace existe con el título que se le pasa.

- [ ] **Step 5: Ajustar `ResumenPage.test.tsx`**

La prueba `DIRECTOR_CARRERA` esperaba el texto del stub. Ahora la vista pide datos y necesita una sesión con carrera. En `apps/web/src/features/dashboard/pages/ResumenPage.test.tsx`:

1. Añade el import `import * as resumenApi from '../api/resumen-carrera.api';` junto a `estructuraApi`.
2. Cambia `montar` para aceptar la identidad opcional y pásala al `ContextoSesion.Provider`:

```tsx
function montar(vistaActiva: RolVista | null, carreraACargo: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
          <ContextoSesion.Provider
            value={{
              ...sesionBase,
              vistaActiva,
              identidad: carreraACargo
                ? { id: 'u1', nombre: 'Usuaria', permisos: [], roles: [], carreraACargo }
                : null,
            }}
          >
            <ResumenPage />
          </ContextoSesion.Provider>
        </CtxEncabezado.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

3. Reemplaza la prueba del Director:

```tsx
  it('DIRECTOR_CARRERA muestra VistaDirectorInicio', () => {
    // Petición que no resuelve: basta el esqueleto propio de la vista para
    // saber que el despachador montó `VistaDirectorInicio` y no otra.
    vi.spyOn(resumenApi, 'obtenerResumenDeCarrera').mockReturnValue(new Promise(() => undefined));
    montar('DIRECTOR_CARRERA', 'c1');
    expect(
      screen.getByRole('status', { name: 'Cargando resumen de la carrera' }),
    ).toBeInTheDocument();
  });
```

Las demás pruebas del archivo no cambian (pasan `identidad: null` como antes).

- [ ] **Step 6: Suite completa del frontend, typecheck y lint**

Run: `npx vitest run` → todo en verde.
Run: `npx tsc --noEmit -p tsconfig.app.json && npx eslint src/features/dashboard src/shared/components/ui` → sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/dashboard/pages/VistaDirectorInicio.tsx \
        apps/web/src/features/dashboard/pages/VistaDirectorInicio.test.tsx \
        apps/web/src/features/dashboard/pages/ResumenPage.test.tsx
git commit -m "feat(dashboard): vista de inicio del Director de Carrera"
```

---

### Task 9: Accesibilidad e2e y verificación final

**Files:**
- Modify: `tests/e2e/specs/accesibilidad.spec.ts` (añadir un bloque tras el de administrador, ~línea 297)

**Interfaces:**
- Consumes: `test`/`expect` de `../fixtures/sesion` (opción `rol: 'director'`), `analizar` de `../fixtures/axe`. El director e2e (`e2e-director@sgc.local`) tiene `DIRECTOR_CARRERA` y la carrera `E2E` («Carrera de Pruebas Automatizadas»), creada por `preparar-e2e.ts` y por el paso de CI que corre `crear-usuario.ts --carrera E2E`.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: Añadir la prueba**

Tras el bloque `test.describe('con la cuenta de administrador', …)`:

```typescript
test.describe('con la cuenta de director', () => {
  // La vista de inicio depende del rol: solo `DIRECTOR_CARRERA` con carrera a
  // cargo ve el resumen de su carrera.
  test.use({ rol: 'director' });

  test('la vista de inicio del director', async ({ page }) => {
    await page.goto('/');
    // Con contenido real: esperar al encabezado descarta analizar el esqueleto
    // de carga, que no distingue «sin problemas» de «axe nunca vio los datos».
    await expect(
      page.getByRole('heading', { level: 1, name: 'Carrera de Pruebas Automatizadas' }),
    ).toBeVisible();

    await analizar(page, 'la vista de inicio del director');
  });
});
```

- [ ] **Step 2: Preparar el entorno y ejecutar el e2e**

Levanta la API compilada (`cd apps/api && npm run build && npm start`) y el frontend (`cd apps/web && npm run dev`) contra la base **`sgc_test`** (no la de desarrollo), con `npx tsx scripts/preparar-e2e.ts` y las cuentas e2e creadas como en el README.md (sección de e2e). Luego, desde `tests/e2e`:

Run: `npx playwright test specs/accesibilidad.spec.ts -g "director"`
Expected: PASS, sin violaciones de axe WCAG 2.1 AA. Si axe reporta contraste, el problema está en un texto fuera de los tokens (no debería haberlos: todo son componentes de Fase 0e); anota el elemento y corrige el token, no el umbral.

- [ ] **Step 3: Verificación final de todo el trabajo**

Run (desde `apps/api`): `npm test` y `npx tsc --noEmit` y `npx eslint src test`
Run (desde `apps/web`): `npx vitest run` y `npx tsc --noEmit -p tsconfig.app.json` y `npx eslint src`
Run (desde `apps/api`, base `sgc_test`): `npm run test:integration`
Expected: todo en verde. Los únicos errores de lint aceptables son los que ya existían antes de este trabajo (por ejemplo `ProveedorSesion.tsx` con `set-state-in-effect`); si aparece alguno nuevo en archivos de este plan, se corrige.

- [ ] **Step 4: Comprobar la vista con datos reales**

Con la API y el frontend levantados sobre la base de desarrollo, inicia sesión como `directora@sgc.local` (rol `DIRECTOR_CARRERA`) y abre `/`. Comprueba:
- Aparece el nombre de la carrera como título y el subtítulo del plan.
- Los KPIs y las secciones cargan sin errores en consola.
- Con `admin@sgc.local` (sin carrera a cargo) y la pestaña «Director de carrera», aparece «Esta vista necesita una carrera asignada.» con el enlace a Usuarios.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/accesibilidad.spec.ts
git commit -m "test(e2e): accesibilidad de la vista de inicio del Director"
```
