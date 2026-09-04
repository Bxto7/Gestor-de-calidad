# Pruebas E2E con Playwright y axe-core — Diseño

**Fecha:** 4 de septiembre de 2026
**Alcance:** el flujo de Mejora Continua de punta a punta, más accesibilidad automatizada sobre sus pantallas.

## 1. Por qué este ciclo existe

`CLAUDE.md` §6.4 sitúa las pruebas E2E de Playwright en CI y en Staging, y §4.7 pide
`axe-core` integrado a ellas. §6.6 las convierte en parte del *Definition of Done*: «si la PR
toca UI: chequeo de accesibilidad automatizado en verde». Hoy no existe ninguna de las dos
cosas.

El hueco importa más de lo que sugiere el recuento de pruebas. Hay 663 unitarias y 217 de
integración en el backend y 168 en el frontend, pero **ninguna atraviesa el sistema entero**.
Los dos fallos encontrados esta semana lo demuestran: los dos vivían en la costura entre
pantalla y base, y los dos aparecieron recorriendo la aplicación a mano, no en la suite.

- Fechar los periodos borraba la matriz entera, porque `declararPeriodos` borra y recrea las
  filas y la cascada se llevaba la programación. Ninguna prueba unitaria podía verlo: el
  repositorio hacía exactamente lo que su prueba le pedía.
- Los hallazgos de consistencia nombraban las competencias por su UUID. Visible solo con
  datos reales atravesando los dos módulos.

Este ciclo convierte aquellos recorridos manuales en pruebas.

## 2. Estado de partida verificado

Comprobado leyendo el código el 4 de septiembre de 2026, no supuesto:

| Hecho | Dónde | Consecuencia para el diseño |
|---|---|---|
| No existe Playwright en el repositorio | sin `playwright.config.*` ni dependencia | Se parte de cero |
| La raíz no tiene `package.json` | `apps/api` y `apps/web` tienen el suyo | La suite necesita el suyo propio |
| `tests/carga/` es el precedente de suite transversal | `tests/carga/README.md` | La E2E va en `tests/e2e/` |
| El token vive en `sessionStorage`, clave `sgc.sesion` | `apps/web/src/shared/api/sesion.ts:16` | **`storageState` no sirve**: solo persiste cookies y `localStorage` |
| El login está limitado a 5/min, fijo en el código | `sesion.controller.ts:33` | Iniciar sesión por prueba es inviable |
| `THROTTLE_LIMIT` no afecta al login | `app.module.ts:227` frente a la línea anterior | Subirlo no resuelve lo de arriba |
| `cargar-plan-isi-2018.ts` deja su plan en HISTÓRICO | línea 345 del script | No sirve de base: RF-PM-001 RN2 exige Aprobado o Vigente |
| El frontend consume la API real | verificado en navegador esta semana | El bloqueo que `ci.yml` declara ya no existe |

La última fila corrige al propio `ci.yml`, cuyo bloque de etapas pendientes afirma que los
flujos E2E «dependen de que el frontend consuma la API real, no la capa simulada». Eso dejó de
ser cierto y hay que actualizarlo.

## 3. Decisiones de diseño

### 3.1 Servicios sueltos en el job, no Docker Compose

El job levanta Postgres como `service` —igual que ya hace el job `esquema`—, arranca la API
construida en segundo plano y sirve el frontend ya compilado.

La alternativa era levantar el `docker-compose.yml` de `infra/`, más fiel a producción porque
incluye Caddy y el worker. Se descarta porque exige imágenes que **no existen**: `apps/api` no
tiene Dockerfile, y §5.4-6 sigue pendiente justamente por eso. Sería empezar por el final.

La tercera opción —Playwright contra una API simulada— no se considera: es lo que ya cubren
las 168 pruebas de componente, y §6.4 pide E2E de verdad.

### 3.2 La sesión se inyecta, no se navega

`sessionStorage` es una decisión deliberada del frontend y está comentada donde se toma: la
sesión muere al cerrar la pestaña, porque el sistema va a usarse en laboratorios compartidos.
`storageState` de Playwright no lo persiste.

Así que `globalSetup` hace **un** `POST /api/v1/auth/login` por rol, guarda el token en
`tests/e2e/.auth/` y un *fixture* lo inyecta con `addInitScript` antes de cada carga de página.

Esto no es un rodeo por comodidad. Con 5 inicios de sesión por minuto y fijos en el código,
una suite que navegue el formulario de acceso en cada prueba se ahoga en la sexta.

La consecuencia a aceptar: **el formulario de acceso no queda cubierto** por estas pruebas. Se
anota como hueco explícito, no como olvido.

### 3.3 Carrera propia y desechable

Los datos los prepara `apps/api/scripts/preparar-e2e.ts`, idempotente, al estilo de los dos
scripts que ya existen. Crea una carrera con código `E2E` —no reutiliza ISI— con su plan
**VIGENTE**, competencias mapeadas a atributos ICACIT reales y dos usuarios: uno con
`medicion.*` y otro de solo lectura.

Las contraseñas llegan por variable de entorno (`SGC_E2E_PASSWORD`) y nunca como argumento,
siguiendo lo que `crear-usuario.ts` ya establece y por su misma razón: los argumentos quedan
en el historial del shell y en la lista de procesos de la máquina.

En CI va como `env:` del workflow **y no como secreto del repositorio**, a propósito. No hay
nada que proteger: el usuario lo crea el script en una base efímera que muere con el job y no
existe en ningún otro sitio. Convertirlo en secreto añadiría un paso manual de configuración
—y un job que falla en silencio hasta que alguien se acuerde de darlo de alta— a cambio de
proteger una credencial que no abre nada. §5.7 pide secretos para lo que los merece; esto no
lo merece, y decirlo aquí evita que alguien lo «arregle» más adelante.

No se reutiliza ISI por dos razones. El cargador de ISI deja su plan en HISTÓRICO, que
RF-PM-001 RN2 no admite como base de un plan de medición. Y colgar las pruebas de datos
institucionales reales las ataría a algo que existe para otro fin: el día que alguien recargue
o corrija el plan de ISI, la suite se rompería sin que nada estuviera mal.

El plan nace VIGENTE desde el script y no recorriendo la aprobación por la interfaz, porque esa
es la máquina de estados de **Plan de Estudios**. Probarla es otro ciclo y otra suite. El
script escribe por debajo de la aplicación igual que hacen el seed y el cargador de ISI,
respetando los invariantes: el índice parcial de única versión vigente por carrera se cumple
porque la carrera es propia.

### 3.4 El limitador de peticiones queda fuera, a propósito

La API se arranca con `THROTTLE_LIMIT=10000`, igual que hace k6 y por el mismo motivo: con 120
peticiones por minuto, la suite mediría el limitador y no la aplicación.

La consecuencia —**estas pruebas no ejercitan el limitador**— se documenta en el README de la
suite, para que nadie concluya de un CI en verde que el limitador funciona.

### 3.5 Ejecución en serie

`workers: 1`. El backend genera el código del plan de medición con un número de versión
correlativo por plan de estudios y tipo; en paralelo, dos pruebas competirían por él y una de
las dos fallaría por una razón que no es la que prueba.

La suite es pequeña y en serie tarda poco. Si algún día crece hasta que estorbe, la salida es
una carrera E2E por worker, no relajar el aislamiento.

## 4. Alcance

### Dentro

| Archivo | Qué recorre |
|---|---|
| `flujo-medicion.spec.ts` | Crear plan → declarar competencias → usar la propuesta de periodos → fecharlos → programar la matriz con ratón → programarla por teclado → consistencia sin hallazgos → enviar a revisión → comprobar que la edición se cierra |
| `regresiones.spec.ts` | Que fechar los periodos **no** borre la matriz; que los hallazgos nombren las competencias por su código y no por su UUID |
| `permisos.spec.ts` | Con `medicion.leer` a secas: cero botones de escritura, cero campos editables, cero celdas pulsables |
| `accesibilidad.spec.ts` | `axe-core` sobre las pantallas que el flujo visita |

### Fuera

- **El formulario de acceso**, por lo dicho en §3.2.
- **El limitador de peticiones**, por lo dicho en §3.4.
- **Plan de Estudios**: su flujo de aprobación y versionado merece su propia suite. Aquí solo
  se consume un plan ya Vigente.
- **Staging**: §6.4 pide allí la suite completa. Staging no existe (§5 pendiente). Cuando
  exista, esta suite es la que corre.
- **Otros navegadores**: solo Chromium. La aplicación es interna y vive detrás de un login; las
  diferencias de motor no son el riesgo que hay que cubrir hoy.

## 5. Estructura

```
tests/e2e/
  package.json            # @playwright/test, @axe-core/playwright
  playwright.config.ts    # workers: 1, solo chromium, webServer del frontend
  global-setup.ts         # un login por rol; guarda los tokens
  fixtures/
    sesion.ts             # inyecta sgc.sesion en sessionStorage
    axe.ts                # analiza la página actual y afirma
  specs/
    flujo-medicion.spec.ts
    regresiones.spec.ts
    permisos.spec.ts
    accesibilidad.spec.ts
  README.md               # al modelo de tests/carga/README.md
  .auth/                  # tokens, ignorado por git
```

## 6. El job de CI

Uno nuevo, `e2e`, con Postgres efímero sobre la base `sgc_e2e`:

1. Instalar dependencias de `apps/api`, `prisma generate`, `migrate deploy`
2. `prisma/seed.ts` (roles, permisos y atributos ICACIT)
3. `scripts/preparar-e2e.ts`
4. Construir y arrancar la API con `THROTTLE_LIMIT=10000`
5. Construir el frontend
6. `playwright install --with-deps chromium`
7. `playwright test`
8. Subir el informe HTML y las trazas como artefacto **cuando falla**

Y se corrige el bloque «Etapas pendientes» de `ci.yml`: la nota sobre la capa simulada ya no es
cierta, y la línea de E2E pasa a implementada.

## 7. Accesibilidad: qué se exige y qué pasa si falla

`@axe-core/playwright` con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa`, fallando
ante cualquier violación. Es lo que §6.6 pide y el nivel que §6.2 fija como objetivo.

**Riesgo asumido, con salida decidida de antemano:** la interfaz actual nunca se ha analizado
con axe. Es posible que arrastre violaciones y que el job salga rojo el primer día. Si ocurre,
la lista se lleva al usuario para decidir entre arreglarlas en este ciclo o registrarlas como
deuda conocida con la prueba pasando. **No se decide sobre la marcha ni se silencian en
silencio**: una excepción sin discutir convierte la puerta de calidad en decoración.

## 8. Criterios de aceptación

1. `npx playwright test` pasa en local con los servicios levantados y los datos preparados.
2. El job `e2e` pasa en CI sobre un Postgres efímero, partiendo de cero.
3. La suite no inicia sesión más de una vez por rol: `global-setup.ts` es el único archivo
   que llama a `/auth/login`, y ningún spec navega el formulario de acceso. Comprobable con
   un `grep` sobre `tests/e2e/`.
4. Las dos regresiones fallan si se revierte su arreglo. Se verifica revirtiendo de verdad, no
   razonando que fallarían.
5. `axe-core` corre sobre las cuatro pantallas del flujo y su resultado queda documentado en el
   README: sin violaciones, o con la lista de las conocidas y por qué.
6. El README dice qué **no** cubre la suite: el acceso y el limitador.
7. El bloque de etapas pendientes de `ci.yml` ya no afirma que el frontend use una capa
   simulada.

## 9. Puntos que quedan anotados

- **Staging.** §6.4 quiere allí la suite completa y en CI solo un subconjunto rápido. Mientras
  Staging no exista, todo corre en CI. Cuando exista, hay que repartir.
- **El formulario de acceso sin cubrir.** La salida natural es una prueba propia que gaste su
  presupuesto de cinco intentos deliberadamente, aislada del resto.
- **Cookies `HttpOnly`.** `sesion.ts` ya anota que guardar tokens en el navegador expone a XSS
  y que la alternativa queda pendiente antes de producción (ASVS L2). El día que se haga, §3.2
  de este documento se simplifica: `storageState` bastaría.
