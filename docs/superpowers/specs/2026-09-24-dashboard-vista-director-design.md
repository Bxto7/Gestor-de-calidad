# Vista de inicio del Director de Carrera — Design

## 1. Qué es esto

Sub-proyecto 3 de las vistas de inicio por rol (el 1, el selector de vista, y
el 2, la vista Admin, ya están en `main`). Reemplaza el stub
`VistaDirectorInicio` con la pantalla "Ingeniería de Sistemas e Informática"
del mockup que compartió el usuario: cuatro KPIs, planes de mejora abiertos,
acción recomendada, pendientes de decisión, un resumen de Mejora Continua y un
enlace a Reportes. Usa la paleta institucional existente, no los colores del
mockup.

Es la vista de `DIRECTOR_CARRERA`, siempre acotada a **su** carrera. La vista
del Docente es el sub-proyecto 4.

## 2. Decisiones ya tomadas con el usuario

1. **Barra y chip de cada plan de mejora se derivan** del estado de
   implementación y del plazo, porque el sistema no mide un porcentaje de
   avance (ver 4).
2. **"Cerrar acta" sin plazo.** Las actas no tienen fecha límite y no se
   agrega ese campo; el pendiente muestra el estado actual como detalle.
3. **Sin carrera a cargo, mensaje claro** y no un selector de carrera. Un
   administrador que abre la pestaña Director lo ve.
4. **Endpoint propio en `mejora-continua`,** mismo patrón que la vista Admin,
   con la carrera tomada siempre de la sesión.
5. Se aceptan las tres reglas propias de 4.1: periodo de referencia, "Aprobada"
   cuenta como acta por cerrar, y solo cuenta como bajo la meta lo que tiene un
   resultado cargado.
6. **Fuera de alcance el sidebar por rol** del mockup (criterios 01-08, "Mi
   carrera").

## 3. Backend

### 3.1 Endpoint

`GET /mejora-continua/resumen-carrera`, en `mejora-continua`.

- **Carrera:** siempre `AuthorizationPort.carreraACargoDe(actor.id)`. No hay
  parámetro de carrera: nadie puede consultar la de otro.
- **Permiso:** `mejora.leer`. Sin carrera a cargo responde 409 con el mensaje
  "Esta vista necesita una carrera asignada".
- **Sin lógica en el controller.** Caso de uso `ConsultarResumenDeCarrera`
  (en `mejora-continua/application/use-cases/`): comprueba permiso y carrera,
  lee de los repositorios propios de `mejora-continua`, pide el plan vigente
  por puerto a `plan-estudios` y delega todo el cálculo en la función de
  dominio de 4.

### 3.2 Puerto ampliado

`ContenidoCurricularPort` (definido en `plan-estudios`, consumido por
`mejora-continua`) gana:

```typescript
/** El plan en estado Vigente de la carrera, o null si no tiene. */
planVigenteDeCarrera(carreraId: string): Promise<PlanVigente | null>;

interface PlanVigente {
  readonly id: string;
  readonly version: number;
  readonly codigo: string;
  readonly fechaVigencia: Date | null;
}
```

Su adaptador en `plan-estudios` lo resuelve con el repositorio de planes. Es la
única dependencia nueva entre módulos.

### 3.3 Consultas nuevas en los repositorios de `mejora-continua`

Los listados actuales de actas, mediciones y evaluaciones no filtran por
carrera, y traer todo para filtrar en memoria no escala. Se agregan consultas
acotadas a la carrera (cada una con su prueba de integración):

- **Medición:** plan de medición vigente de un `planEstudiosId`; periodos de ese
  plan; conteo de celdas programadas y `realizada` por periodo.
- **Mejora:** planes de mejora de la carrera con `estadoImplementacion` distinto
  de `COMPLETADO`; planes de la carrera en estado En revisión.
- **Evaluación:** resultados `porcentajeAlcanzado` del plan de evaluación
  vigente de la carrera en un periodo; competencias y asignaturas evaluadas sin
  responsable.
- **Actas:** actas de la carrera fuera de los estados finales.

### 3.4 Respuesta

```typescript
interface ResumenDeCarrera {
  carrera: { id: string; nombre: string };
  plan: { estado: 'VIGENTE'; version: number; anio: number | null } | null;
  kpis: {
    medicionesCerradas: number;
    medicionesTotal: number;
    planesMejoraAbiertos: number;
    accionesQueVencen: number;       // vencidas o con plazo en los próximos 7 días
  };
  planesMejoraAbiertos: {
    id: string;
    codigo: string;
    nombre: string;
    aspectoCodigo: string | null;    // criterio, objetivo o competencia a la que se ata
    responsable: string | null;
    plazo: string;                   // ISO 8601, solo fecha
    estadoImplementacion: 'PENDIENTE' | 'EN_PROCESO';
    progreso: 0 | 50;
    chip: 'INICIANDO' | 'EN_PROCESO' | 'POR_VENCER' | 'VENCIDA';
  }[];
  competenciasBajoMeta: {
    id: string;
    codigo: string;
    nombre: string;
    alcanzado: number;               // 0-100
    meta: number;                    // 0-100, ya convertida desde la fracción
  }[];
  pendientes: {
    tipo: 'APROBAR_PLANES' | 'CERRAR_ACTA' | 'ASIGNAR_RESPONSABLE';
    texto: string;
    detalle: string;
    urgente: boolean;
  }[];
  mejoraContinua: {
    periodoMedicion: string | null;      // etiqueta del periodo de referencia
    evaluacionesSinResponsable: number;
    planesMejoraAbiertos: number;
    actasPorCerrar: number;
  };
}
```

`planesMejoraAbiertos` y `pendientes` llegan ordenados y recortados (ver 4);
el frontend no ordena ni recorta.

## 4. Reglas de cálculo (dominio puro, sin Prisma ni NestJS)

Función `calcularResumenDeCarrera` en `mejora-continua/domain/services/`. Recibe
los datos ya leídos y la fecha de hoy como parámetro (nunca `new Date()` dentro:
las pruebas de borde de fecha dependen de eso).

### 4.1 Reglas

- **Periodo de referencia:** el primer periodo del plan de medición vigente que
  no esté cerrado (`fechaCierre` nula o posterior a hoy); si todos cerraron, el
  último por `orden`. Sin plan de medición vigente, no hay periodo de
  referencia: mediciones 0 de 0, sin competencias bajo la meta y
  `periodoMedicion` nulo.
- **Mediciones N de M:** en el periodo de referencia, celdas programadas (M) y
  las que tienen `realizada = true` (N).
- **Plan de mejora abierto:** `estadoImplementacion` distinto de `COMPLETADO`.
- **Chip** (en este orden de precedencia):
  1. `VENCIDA` si `plazo` es anterior a hoy.
  2. `POR_VENCER` si `plazo` está entre hoy y hoy + 7 días, ambos inclusive.
  3. `EN_PROCESO` si `estadoImplementacion = EN_PROCESO`.
  4. `INICIANDO` en otro caso (`PENDIENTE`).
- **Barra:** `EN_PROCESO` = 50, `PENDIENTE` = 0. Es una convención visual, no
  una medición, y el comentario del código lo dice.
- **`accionesQueVencen`:** abiertos con chip `VENCIDA` o `POR_VENCER`. No es un
  subconjunto de la lista recortada: cuenta todos, se muestren o no.
- **Orden de `planesMejoraAbiertos`:** por gravedad del chip (`VENCIDA`,
  `POR_VENCER`, `EN_PROCESO`, `INICIANDO`), luego por `plazo` ascendente, luego
  por `codigo`. Máximo 5. `kpis.planesMejoraAbiertos` cuenta todos.
- **Competencias bajo la meta:** en el periodo de referencia,
  `porcentajeAlcanzado / 100 < meta` **y** sin plan de mejora abierto atado a
  esa competencia. Una competencia sin resultado cargado no cuenta.
- **Pendientes** (en este orden, máximo 5 en total; si hay más, los últimos
  tipos se recortan primero):
  1. `APROBAR_PLANES`: un solo pendiente "Aprobar N planes de mejora enviados",
     con los códigos como detalle, si hay planes en estado En revisión.
     `urgente` si hay alguno.
  2. `CERRAR_ACTA`: uno por acta de la carrera en Borrador o En revisión, con
     el estado como detalle y sin plazo. `urgente` es falso.
  3. `ASIGNAR_RESPONSABLE`: uno por competencia o asignatura evaluada sin
     responsable. `urgente` es falso.
- **`actasPorCerrar`:** actas de la carrera que no están en Emitida ni
  Histórica. Aprobada cuenta como por cerrar.
- **`evaluacionesSinResponsable`:** competencias y asignaturas evaluadas sin
  responsable, sumadas.
- **`plan.anio`:** año de `fechaVigencia`; nulo si no tiene.

### 4.2 Aislamiento

`mejora-continua` ya importa de `plan-estudios` únicamente puertos. Se comprueba
con la guardia existente (`mejora-continua/aislamiento.spec.ts`); esta función y
el caso de uso no agregan ningún otro import hacia `plan-estudios`.

## 5. Frontend

`apps/web/src/features/dashboard/`:

```
api/
  resumen-carrera.api.ts     — obtenerResumenDeCarrera()
domain/
  vista-director.ts          — traductores de la respuesta a props (chip → tono, etc.)
pages/
  VistaDirectorInicio.tsx    — reemplaza el stub
```

- **Tarjeta morada compartida.** `AccionRecomendada` de la vista Admin está
  atada a esa vista (recibe carreras, texto fijo), y el mockup del Docente
  tiene otra tarjeta igual. Se extrae `TarjetaDeAccion` a
  `shared/components/ui/index.tsx` con `{ etiqueta, titulo, descripcion,
  boton: { texto, href } }`, y `AccionRecomendada` pasa a usarla sin cambiar
  su comportamiento ni sus pruebas. Solo tokens existentes.
- **Composición** con lo ya construido: `KpiCard` ×4, `DataPanel` para los
  planes abiertos (`tag` = código, `meta` = "aspecto · responsable · vence
  fecha", `progreso`, `chip` con tono `progreso`/`inactivo`/`encurso` según el
  chip de la respuesta), `TarjetaDeAccion` para las competencias bajo la meta,
  `PendingList`, `SecondaryCardGrid` para las cuatro tarjetas de Mejora
  Continua (Medición, Evaluación, Mejora, Cierre) y `ReportBridgeCard`.
- **Tarjeta de acción:** solo si `competenciasBajoMeta` no está vacío. Título
  "N competencias por debajo de la meta", descripción con los nombres de las
  dos primeras y el periodo, botón "Crear plan de mejora".
- **Subtítulo:** "Plan de estudios AÑO vigente. Tienes N planes de mejora
  abiertos y M acciones que vencen." Sin plan vigente: "Esta carrera no tiene un
  plan de estudios vigente."
- **Sin carrera a cargo:** si `identidad.carreraACargo` es nulo, la vista no
  llama al endpoint y muestra "Esta vista necesita una carrera asignada" con
  enlace a `/usuarios`. Si el endpoint responde 409 se muestra lo mismo.
- **Enlaces:** "Ver todo" y la tarjeta Mejora → `/mejora-continua/mejora`;
  Medición → `/mejora-continua/medicion`; Evaluación →
  `/mejora-continua/evaluacion`; Cierre → `/mejora-continua/actas`; "Crear plan
  de mejora" → `/mejora-continua/mejora`.
- **Datos:** un solo `useQuery` con clave `['resumen-carrera']`.
- **Colores:** solo tokens existentes de `apps/web/src/styles/global.css`.

## 6. Errores y estados de carga

- **Cargando:** esqueletos en KPIs y paneles, sin salto de tamaño.
- **Falla el endpoint** (red, 403, 500): mensaje de error dentro de la vista con
  reintento; el shell no se afecta.
- **Sin plan de estudios vigente:** el KPI "Estado del plan" muestra "Sin plan
  vigente"; el resto de la vista sigue funcionando con lo que haya.
- **Sin planes de mejora abiertos:** el panel muestra su estado vacío y la
  tarjeta morada no aparece.
- **Sin pendientes:** `PendingList` muestra su estado vacío.

## 7. Testing

- **Dominio** (`calcularResumenDeCarrera`), con la fecha inyectada: chip en los
  bordes (plazo ayer, hoy, hoy+7, hoy+8); precedencia `VENCIDA` sobre
  `EN_PROCESO`; `COMPLETADO` excluido; orden y tope de 5 con desempate;
  `accionesQueVencen` cuenta todos aunque se recorten; periodo de referencia
  (primero abierto, todos cerrados → último, sin plan de medición);
  competencia bajo la meta con y sin plan de mejora atado, y sin resultado
  cargado; pendientes en orden y con tope; "Aprobada" cuenta como acta por
  cerrar.
- **Caso de uso,** con puertos falsos: sin `mejora.leer` deniega sin consultar
  nada; sin carrera a cargo lanza el 409; sin plan vigente devuelve `plan:
  null`.
- **Integración del endpoint** (base efímera): 403 sin permiso, 409 sin
  carrera, 200 con datos sembrados coherentes, y **aislamiento**: un director
  no ve datos de otra carrera aunque existan.
- **Consultas nuevas de repositorio:** una prueba de integración por consulta.
- **Puerto ampliado:** prueba del adaptador de `plan-estudios` (con vigente, sin
  vigente, ignora planes en otro estado).
- **Guardia de aislamiento** de `mejora-continua` sigue en verde.
- **Frontend:** la vista con el endpoint simulado — datos completos, sin
  competencias bajo la meta (sin tarjeta), sin carrera a cargo, error con
  reintento, carga y sin plan vigente. `TarjetaDeAccion` con su propia prueba y
  las pruebas de `AccionRecomendada` sin cambios. Chequeo de accesibilidad con
  `axe-core` como el resto de pantallas.

## 8. Limitaciones conocidas (aceptadas)

- El avance de cada plan es una convención (0 % o 50 %), no una medición: el
  sistema solo distingue Pendiente, En proceso y Completado.
- El periodo de referencia es una regla de esta vista ("el primer periodo no
  cerrado"), no un concepto que el sistema ya tuviera. Si el proceso real usa
  otro criterio, se cambia solo en la función de dominio.
- El responsable de un plan de mejora es texto libre y se muestra tal cual.
- Las actas no tienen plazo, así que el pendiente de cerrar acta nunca se marca
  como urgente.
- Una competencia programada pero sin resultado cargado no aparece como alerta.

## 9. Fuera de alcance

- El sidebar por rol del mockup (criterios de acreditación 01-08, "Mi carrera").
- Un selector de carrera para el administrador.
- Fecha límite en las actas.
- Un porcentaje de avance real por plan de mejora.
- La vista del Docente (sub-proyecto 4) y la decisión pendiente sobre usuarios
  con `COORDINADOR_ACADEMICO` y `DOCENTE` a la vez.
