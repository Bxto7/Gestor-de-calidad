# Plan de Evaluación · ciclo 2c-B — la configuración directa

**Fecha:** 7 de septiembre de 2026
**Submódulo:** Mejora Continua · Plan de Evaluación (`RF-PE`)
**Alcance de este ciclo:** RF-PE-006, RF-PE-007 y RF-PE-013 a RF-PE-021 (11 requisitos)
**Ciclo anterior:** `2026-09-05-plan-evaluacion-2c-a-design.md`

---

## 1. Dónde encaja y dónde acaba

2c-A dejó el plan de evaluación existiendo: se crea desde un plan de medición
Aprobado o Vigente, recorre su ciclo de vida, y su detalle muestra las
competencias y periodos que hereda **en solo lectura**. El hueco quedó visible y
vacío a propósito.

2c-B lo llena, del lado **directo**. Al terminar, para cada cruce
competencia-periodo que el plan de medición programó se podrá registrar con qué
instrumento se evalúa, con qué frecuencia, a través de qué asignaturas, con qué
entregable, quién es el docente responsable, qué porcentaje se alcanzó y dónde
está la evidencia.

**Fuera de 2c-B:** la configuración **indirecta** (RF-PE-022 a 030) es 2c-C; la
exportación, el versionado y la aprobación con validación integral son 2c-D.

| Ciclo | RF | Estado |
|---|---|---|
| 2c-A | 000–005, 008–012, 043–048 | hecho |
| **2c-B** (este) | **006–007, 013–021** | — |
| 2c-C | 022–030 | — |
| 2c-D | 031–042 | — |

---

## 2. Tres niveles de dato, tres tablas

Los requisitos no describen un formulario plano: describen tres niveles, y lo
dicen con reglas de negocio explícitas.

| Nivel | Qué guarda | La RN que lo fija |
|---|---|---|
| Competencia | instrumento, frecuencia | RF-PE-013 RN1: «dato único por competencia, **no varía por periodo**» |
| Competencia × periodo | porcentaje alcanzado | RF-PE-019 RN1: «único valor por competencia y periodo, **no por asignatura individual**» |
| Competencia × periodo × asignatura | entregable, docente | RF-PE-017 RN1, RF-PE-018 |
| ↳ y sus evidencias | enlaces | RF-PE-020 RN2: «puede registrarse **más de una** por asignatura asociada» |

**Decisión: una tabla por nivel.** Cada regla de negocio se convierte en un
índice único, no en una comprobación que alguien tiene que acordarse de escribir.

Se descartaron dos formas más cortas, y las dos por el mismo motivo:

- **Repetir el porcentaje en cada asignatura** (dos tablas en vez de tres).
  Guarda el mismo valor N veces; en cuanto dos filas del mismo cruce digan
  cosas distintas, no hay forma de saber cuál vale. Es literalmente lo que
  RF-PE-019 RN1 prohíbe.
- **Una tabla ancha con el instrumento por fila.** El mismo defecto un nivel
  más arriba, contra RF-PE-013 RN1.

No es purismo: este proyecto nace de un Excel que declaraba 249 créditos en un
sitio y 210 en otro por sostener dos copias del mismo dato. Ahorrar dos tablas
no vale reproducir esa forma.

### El esquema

Todo en `mejora_continua`, en `evaluacion/`.

```prisma
/// RF-PE-013 y RF-PE-014: instrumento y frecuencia, una vez por competencia.
model ConfiguracionCompetencia {
  id               String @id @default(uuid()) @db.Uuid
  planEvaluacionId String @map("plan_evaluacion_id") @db.Uuid
  /// UUID sin clave foránea: la competencia vive en el esquema de Plan de
  /// Estudios y §3.2 prohíbe la FK entre módulos.
  competenciaId    String @map("competencia_id") @db.Uuid

  instrumento String? @db.VarChar(300)
  frecuencia  String? @db.VarChar(120)

  plan PlanEvaluacion @relation(fields: [planEvaluacionId], references: [id], onDelete: Cascade)

  /// RF-PE-013 RN1: una sola fila por competencia. El índice hace imposible
  /// que dos instrumentos distintos convivan para la misma.
  @@unique([planEvaluacionId, competenciaId])
  @@map("configuracion_competencia")
  @@schema("mejora_continua")
}

/// RF-PE-019: el porcentaje alcanzado de una competencia en un periodo.
model MedicionAlcanzada {
  id               String @id @default(uuid()) @db.Uuid
  planEvaluacionId String @map("plan_evaluacion_id") @db.Uuid
  competenciaId    String @map("competencia_id") @db.Uuid
  /// El periodo también es un UUID del plan de medición base, sin FK.
  periodoId        String @map("periodo_id") @db.Uuid

  /// RF-PE-019 RN2: entre 0 y 100. El CHECK se añade en la migración; el DTO
  /// protege la puerta HTTP, el CHECK protege el dato.
  porcentajeAlcanzado Int? @map("porcentaje_alcanzado") @db.SmallInt

  plan       PlanEvaluacion      @relation(fields: [planEvaluacionId], references: [id], onDelete: Cascade)
  asignaturas AsignaturaEvaluada[]

  @@unique([planEvaluacionId, competenciaId, periodoId])
  @@map("medicion_alcanzada")
  @@schema("mejora_continua")
}

/// RF-PE-016 a RF-PE-018: una asignatura que evalúa esa competencia en ese periodo.
model AsignaturaEvaluada {
  id                  String @id @default(uuid()) @db.Uuid
  medicionAlcanzadaId String @map("medicion_alcanzada_id") @db.Uuid
  asignaturaId        String @map("asignatura_id") @db.Uuid

  /// RF-PE-017 RN1: obligatorio. NOT NULL, no «obligatorio en el formulario».
  entregable String @db.VarChar(300)
  /// RF-PE-018. UUID de una cuenta de usuario con rol DOCENTE, sin clave
  /// foránea: el registro debe seguir siendo legible aunque la cuenta
  /// desaparezca, igual que `solicitadoPor` en los documentos generados.
  docenteId  String? @map("docente_id") @db.Uuid

  medicion   MedicionAlcanzada @relation(fields: [medicionAlcanzadaId], references: [id], onDelete: Cascade)
  evidencias Evidencia[]

  /// RF-PE-016: la misma asignatura no se asocia dos veces al mismo cruce.
  @@unique([medicionAlcanzadaId, asignaturaId])
  @@map("asignatura_evaluada")
  @@schema("mejora_continua")
}

/// RF-PE-020: dónde está la evidencia del entregable.
model Evidencia {
  id                   String @id @default(uuid()) @db.Uuid
  asignaturaEvaluadaId String @map("asignatura_evaluada_id") @db.Uuid

  enlace      String @db.VarChar(2000)
  /// Sin ella, cinco enlaces en un expediente son cinco URLs indistinguibles.
  descripcion String @db.VarChar(200)
  orden       Int    @default(0) @db.SmallInt

  asignatura AsignaturaEvaluada @relation(fields: [asignaturaEvaluadaId], references: [id], onDelete: Cascade)

  @@map("evidencia")
  @@schema("mejora_continua")
}
```

**Por qué tantos campos admiten nulo.** `instrumento`, `frecuencia`,
`porcentajeAlcanzado` y `docenteId` son opcionales en la base a propósito: la
configuración se rellena por partes —RF-PE-021 lo exige— y RF-PE-013 dice
expresamente que una competencia sin instrumento *«se marca como pendiente para
la validación de completitud»*, no que se rechace. Lo que **no** admite nulo es
el entregable, porque RF-PE-017 RN1 sí lo declara obligatorio. La completitud es
cosa de la validación integral de 2c-D, no de las columnas.

**`AsignaturaEvaluada` cuelga de `MedicionAlcanzada`**, así que asociar
asignaturas a un cruce exige que su fila exista. El caso de uso la crea si falta
—con el porcentaje en nulo— en la misma transacción. Es una fila de una tabla
que representa el cruce, no un dato que alguien tenga que introducir primero.

`Cascade` en las cuatro: borrar un plan de evaluación en Borrador se lleva su
configuración entera, que sin él no significa nada. Es lo contrario del
`Restrict` de 2c-A hacia el plan de medición, y por la razón opuesta: aquello es
una referencia a algo ajeno que sigue existiendo; esto es contenido propio.

**Las evidencias son tabla y no una columna `String[]`.** Un array de URLs no
distingue «rúbrica firmada» de «acta de la reunión», y RF-PE-020 RN2 admite
varias. Con tabla, cada una lleva su descripción y su orden.

---

## 3. La frontera de estados, escrita en la forma de la API

RF-PE-006 bloquea la edición en Aprobado, Vigente e Histórico. Su **RN2**
concede una excepción: *«Se exceptúa el registro progresivo de mediciones por
periodo o año, el cual sí se permite en estado Vigente»*.

La excepción es necesaria y no un capricho: el porcentaje alcanzado de 2026-I no
se puede conocer mientras el plan sigue en Borrador. Sin ella, la mitad del
submódulo sería inútil.

**Decisión sobre dónde cae la frontera:**

| | Borrador | Vigente | Aprobado · Histórico |
|---|---|---|---|
| instrumento, frecuencia | ✅ | ❌ | ❌ |
| asignaturas, entregable, docente | ✅ | ❌ | ❌ |
| **porcentaje alcanzado** | ✅ | ✅ | ❌ |
| **evidencias** | ✅ | ✅ | ❌ |

Lo congelado es **la definición del plan** —con qué se evalúa, a través de qué
asignaturas, quién responde—: eso es lo que alguien aprobó. Lo que sigue abierto
es **lo que fue ocurriendo**: cuánto se alcanzó y dónde está la prueba. Cambiar
la definición exige versionar (RF-PE-035, ciclo 2c-D).

Aprobado queda fuera de la excepción porque RN2 nombra solo Vigente. Un plan
Aprobado todavía no rige; registrar en él lo que ocurrió sería registrar el
seguimiento de un plan que aún no ha entrado en vigor.

**Esto no se comprueba comparando lo que llega con lo guardado.** Esa
comparación es frágil —hay que acertar qué campos mirar, y el día que se añada
uno se olvida— y además ilegible. Se comprueba **partiendo los endpoints**: los
de configuración exigen Borrador; los dos de seguimiento aceptan Vigente. Quien
lea el controlador ve la regla sin abrir el caso de uso.

### Divergencia a registrar: las referencias de RF-PE-006 RN2 están mal

RN2 remite a «RF-PE-022 y RF-PE-028» como los requisitos de registro progresivo.
No lo son: RF-PE-022 es *«establecer el instrumento (Indirecta)»* y RF-PE-028
son *«las indicaciones (Indirecta)»*. Los que sí describen registro progresivo
son **RF-PE-019** (porcentaje alcanzado por periodo, directa) y **RF-PE-026**
(porcentaje de cumplimiento por año, indirecta).

Leída al pie de la letra, la excepción no alcanzaría al plan **directo** en
absoluto, y entonces nunca podría registrarse lo alcanzado. Se toma como errata
de referencia y se registra como **D-13**, para que la universidad lo corrija en
el documento fuente en vez de que quede como una interpretación nuestra sin
constancia.

---

## 4. Validaciones

| Regla | Dónde vive |
|---|---|
| RF-PE-012: solo se configura donde la matriz base programó | Caso de uso, leyendo `matriz(planMedicionId)`. Correcto siempre por construcción: no copiamos la matriz, la leemos |
| RF-PE-016: solo asignaturas del plan de estudios base | Caso de uso, contra `ContenidoCurricularPort` |
| RF-PE-013/014: solo competencias que el plan base declaró | Caso de uso, contra `porId().competenciaIds` |
| RF-PE-017 RN1: entregable obligatorio | `NOT NULL` en la columna |
| RF-PE-019 RN2: porcentaje entre 0 y 100 | `CHECK` en la migración **y** DTO |
| RF-PE-016: una asignatura no se asocia dos veces al mismo cruce | Índice único |
| RF-PE-013 RN1: un instrumento por competencia | Índice único |
| RF-PE-006/007: la frontera de estados | Forma de los endpoints (§3) |

El docente **no se valida contra el rol**: se guarda el UUID que llega. Validar
que tenga rol `DOCENTE` en el momento de guardar convertiría un cambio de rol
futuro en un dato histórico inválido. La pantalla ofrece solo docentes; el
registro conserva a quien fuera responsable entonces.

---

## 5. Endpoints

```
GET  /planes-evaluacion/:id/configuracion                     todo lo configurado
GET  /planes-evaluacion/:id/asignaturas-elegibles             las del plan de estudios base
GET  /docentes                                                 usuarios con rol DOCENTE

PUT  /planes-evaluacion/:id/competencias/:cId                          ← solo Borrador
       { instrumento, frecuencia }

PUT  /planes-evaluacion/:id/competencias/:cId/periodos/:pId/asignaturas  ← solo Borrador
       [{ asignaturaId, entregable, docenteId }]

PUT  /planes-evaluacion/:id/competencias/:cId/periodos/:pId/medicion     ← Borrador y Vigente
       { porcentajeAlcanzado }

PUT  /planes-evaluacion/:id/asignaturas-evaluadas/:aeId/evidencias       ← Borrador y Vigente
       [{ enlace, descripcion }]
```

**Cada `PUT` reemplaza su conjunto entero**, no aplica un cambio parcial. Eso
satisface RF-PE-021 —*«guardar el avance de un periodo sin completar los
demás»*— con una petición por guardado, y evita **por construcción** la carrera
de escrituras que mordió en el ciclo de exportación: no hay dos peticiones
parciales que puedan pisarse por orden de llegada.

`GET /docentes` cuelga de la raíz y no de `/planes-evaluacion`: es un catálogo,
no un subrecurso del plan. Exige `evaluacion.leer`.

---

## 6. Puertos a ampliar

Dos, y los dos ya existen — ninguna frontera nueva.

**`ContenidoCurricularPort`** gana:

```ts
/** RF-PE-016: las asignaturas sobre las que se puede evaluar. */
asignaturasDelPlan(planEstudiosId: string): Promise<AsignaturaBase[]>;

interface AsignaturaBase {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly cicloNumero: number | null;
  readonly activa: boolean;
}
```

El ciclo no es adorno: con 74 asignaturas, un desplegable sin agrupar es
inservible.

**`DirectorioDeUsuariosPort`** gana:

```ts
/** Cuentas activas con ese rol, para elegir responsable. */
porRol(codigoRol: string): Promise<{ id: string; nombre: string }[]>;
```

Hoy solo sabe traducir identificadores a nombres. Sigue siendo deliberadamente
pobre: no devuelve `DatosUsuario` entero, que lo convertiría en una puerta
trasera al módulo de usuarios.

`mejora-continua/aislamiento.spec.ts` ya permite los dos puertos; no hay que
tocarla.

---

## 7. Pantalla

Una tarjeta nueva en el detalle del plan, bajo la de lo heredado.

**Un selector de periodo** arriba — RF-PE-015 pide elegir uno y completarlo, sin
orden obligatorio ni necesidad de terminar los demás. Dentro, las competencias
que **ese periodo tiene programadas** en la matriz base.

Las competencias no programadas en ese periodo **no se muestran**. RF-PE-012 dice
que ahí no se configura nada, y enseñarlas desactivadas sería ofrecer algo que no
se puede hacer.

Cada competencia despliega:

- **Instrumento y frecuencia**, con una nota de que valen para todos los
  periodos — si no, quien los edite creerá que está configurando solo este.
- **Porcentaje alcanzado**, un único campo (RF-PE-019 RN1).
- **Sus asignaturas**: código y nombre, entregable, docente, y sus enlaces de
  evidencia con descripción.

Con el plan en Vigente, todo se muestra pero solo el porcentaje y las evidencias
aceptan cambios, con el motivo escrito al lado — no un campo desactivado y mudo.

---

## 8. Errores

| Situación | Respuesta |
|---|---|
| Configurar un cruce que la matriz base no programó | 409, nombrando la competencia y el periodo |
| Asignatura ajena al plan de estudios base | 409, con el código de la asignatura |
| Competencia que el plan base no declaró | 409 |
| Editar la definición fuera de Borrador | 409, con el estado y la sugerencia de versionar (RF-PE-006) |
| Registrar medición en Aprobado o Histórico | 409, diciendo que solo se registra sobre un plan Vigente |
| Porcentaje fuera de 0–100 | 400 del DTO; el `CHECK` es la segunda barrera |
| Entregable vacío | 400 del DTO |

---

## 9. Pruebas

| Nivel | Qué cubre |
|---|---|
| Unitarias de dominio | El porcentaje como value object (0–100, entero); qué campos admite cada estado |
| Unitarias del caso de uso | Las tres validaciones de pertenencia (cruce programado, asignatura del plan, competencia declarada); que los endpoints de configuración exijan Borrador y los de seguimiento acepten Vigente; que cada permiso se compruebe |
| Integración | Los tres índices únicos; el `CHECK` del porcentaje rechazando 101 y −1; el `Cascade` llevándose la configuración al borrar el plan |
| E2E | Configurar un periodo entero y guardarlo; comprobar que otro periodo del mismo plan sigue vacío (RF-PE-021); que un plan Vigente deja registrar el porcentaje pero no cambiar las asignaturas |
| Accesibilidad | Las pantallas nuevas entran en `accesibilidad.spec.ts`, como exige la Definición de Terminado de CLAUDE.md §6.6 |

Cada comportamiento nuevo se comprueba **por mutación** antes de darlo por
bueno: se revierte y se confirma que la prueba se pone en rojo. Esa práctica
destapó dos pruebas vacuas en 2b-B y una en 2c-A.

---

## 10. Decisiones tomadas en este diseño

1. **Una tabla por nivel** (§2), porque las formas más cortas incumplen una RN
   explícita por construcción.
2. **Las evidencias son enlaces, no archivos subidos** — decidido el 7 de
   septiembre de 2026 y registrado como **D-12**. Subir archivos implica
   multipart, límites, validación de tipo, servido con permisos y un bucket de
   B2 sin contratar; hoy el sistema genera documentos, no los recibe. La
   decisión es reversible en la dirección correcta: añadir archivos después no
   deshace los enlaces guardados.
3. **El docente es una cuenta de usuario con rol `DOCENTE`**, no texto libre ni
   entidad propia — decidido el 7 de septiembre de 2026. Trazable y sin datos
   duplicados.
4. **La frontera de estados se codifica partiendo los endpoints** (§3), no
   comparando cargas útiles.
5. **Aprobado no admite registro de mediciones**, solo Vigente, porque RN2
   nombra solo Vigente y un plan Aprobado todavía no rige.
6. **El docente no se valida contra su rol al guardar** (§4): un cambio de rol
   futuro no debe invalidar un registro histórico.

## 11. Lo que este diseño no resuelve

- **El desplegable de docentes saldrá vacío hasta que existan cuentas con rol
  `DOCENTE`.** El seed crea el rol pero ningún usuario con él. Es un requisito
  operativo, no de código: hay que confirmar con la universidad que los docentes
  tendrán cuenta antes de que esto llegue a producción. Si no la van a tener, la
  decisión 3 se revisa y vuelve a texto libre.
- **Un enlace de evidencia puede romperse** —una carpeta que se mueve, un
  permiso que cambia— y el sistema no lo detecta. Comprobar enlaces
  periódicamente es trabajo de otro ciclo, si la universidad lo pide.
- **Nada valida que el porcentaje alcanzado guarde relación con la meta del plan
  de medición.** RF-PE-019 no lo pide; la comparación meta/alcanzado es materia
  de los reportes de 2c-D.
