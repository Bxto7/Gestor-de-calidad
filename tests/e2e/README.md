# Pruebas de extremo a extremo (Playwright)

`CLAUDE.md` §6.4 las sitúa en CI —un subconjunto rápido en cada PR— y en Staging, con la suite
completa antes de cada release. Staging no existe todavía (§5 pendiente), así que por ahora
todo corre en CI.

Cubren el flujo de Mejora Continua contra la API real y la accesibilidad de sus pantallas
contra WCAG 2.1 AA, que §6.6 exige en cada PR que toque interfaz. Un spec —
`competencias-sin-atributo.spec.ts` — llama a la API directamente, sin pantalla, para las
reglas que la interfaz solo refleja (hoy, RF127): usa el token que `global-setup` ya guardó
(`fixtures/api.ts`), porque el login admite cinco intentos por minuto y la suite gasta los
cinco.

## Qué NO cubren

Dos huecos deliberados, y conviene saberlos antes de leer un verde:

1. **El formulario de acceso.** La sesión se inyecta en `sessionStorage` en vez de navegarse,
   porque `sesion.controller.ts:33` limita el login a cinco intentos por minuto con el número
   escrito en el código —`THROTTLE_LIMIT` gobierna el resto de la API, pero no eso—. Una suite
   que navegara el formulario en cada prueba se ahogaría en la sexta.
2. **El limitador de peticiones.** La API se arranca con `THROTTLE_LIMIT=10000`, igual que
   hacen las pruebas de carga y por lo mismo: con 120 por minuto la suite mediría el limitador
   y no la aplicación. **Un verde aquí no dice nada sobre si el limitador funciona.**

También quedan fuera Plan de Estudios —su flujo de aprobación y versionado merece su propia
suite; aquí solo se consume un plan ya Vigente— y los navegadores que no sean Chromium.

## Antes de ejecutar en local

```bash
# 1. Servicios
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Esquema, catálogo y datos de prueba
cd apps/api
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run e2e:preparar

# 3. Las cinco cuentas
export SGC_E2E_PASSWORD='E2E.Pruebas.2026!'
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-editor@sgc.local --nombre "E2E Editor" \
  --rol COORDINADOR_ACADEMICO --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-lector@sgc.local --nombre "E2E Lector" --rol USUARIO_CONSULTOR
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-docente@sgc.local --nombre "E2E Docente" \
  --rol DOCENTE --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-director@sgc.local --nombre "E2E Director" \
  --rol DIRECTOR_CARRERA --carrera E2E
SGC_PASSWORD="$SGC_E2E_PASSWORD" npx tsx scripts/crear-usuario.ts \
  --email e2e-admin@sgc.local --nombre "E2E Admin" \
  --rol ADMIN_SISTEMA

# 4. La API, con el limitador alto
npm run build && THROTTLE_LIMIT=10000 npm start

# 5. El worker de documentos, en otra terminal
npm run start:worker
```

El worker no es opcional: los PDF y Excel se generan en una cola de BullMQ y solo él la
consume. Sin él, la API responde bien pero los documentos se quedan en «Pendiente» y fallan
las pruebas que esperan verlos «Listo» (`exportacion`, `documentos-evaluacion`,
`plan-mejora-2c-j-c` y dos de `accesibilidad`). CI ya lo arranca aparte (`ci.yml`).

`npm run build` compila con el cliente Prisma que haya generado: si el esquema cambió desde
la última vez, `npx prisma generate` antes, o `tsc` fallará con propiedades que «no existen».

La contraseña va por variable de entorno y no como argumento: los argumentos quedan en el
historial del shell y en la lista de procesos.

`export` en línea aparte del comando que la usa: asignarla y leerla en la misma línea no
funciona, porque el shell expande la variable antes de asignarla.

## Ejecutar

```bash
cd tests/e2e
npm ci
npx playwright install chromium
npx playwright test            # todo
npx playwright test --ui       # con el inspector, para depurar
npx playwright show-report     # el informe de la última ejecución
```

Playwright arranca `vite preview` por su cuenta; la API hay que levantarla antes, porque
necesita su base preparada primero.

Si la API no está viva, `global-setup.ts` lo dice con un mensaje y el comando para arrancarla,
en vez de dejar que fallen quince pruebas por razones distintas.

## Por qué corre en serie

`workers: 1`. El backend genera el código del plan de medición con un correlativo por plan de
estudios y tipo: dos pruebas en paralelo competirían por el mismo número y una fallaría por
una razón que no es la que prueba.

Los planes se acumulan entre ejecuciones, y cada prueba toma el más reciente con `.first()`.
Eso **no siempre es inocuo**: el 25 de septiembre de 2026, repetir la suite sin reiniciar hizo
fallar tres pruebas que habían pasado en la primera vuelta (`configuracion-evaluacion`,
`configuracion-indirecta` y `documentos-evaluacion`, con «asignaturas asociadas sin docente
responsable») y que volvieron a pasar tras `npm run e2e:preparar`. Ante un fallo que no
reconoces, reinicia los datos antes de investigar. `e2e:preparar` solo toca la carrera `E2E`.

`e2e:preparar` siembra también `CPE-E2E05`, una competencia **sin atributo del graduado**, a
propósito: sin ella ninguna prueba llegaría a la rama de RF127 (casilla deshabilitada en la
pantalla, rechazo en la API). Va fuera de la lista de competencias del plan de medición de
partida, porque una competencia sin atributo no puede formar parte de un plan de medición.

## Por qué el bundle y no el servidor de desarrollo

`webServer` corre `vite preview`, que sirve lo mismo que Caddy servirá en producción (§5.2).
Para que eso funcione, `vite.config.ts` declara `preview.proxy` además de `server.proxy`:
`preview` **no** hereda el de `server`, y el frontend pide a `/api/v1/...` en relativo. Sin
ese proxy, cada petición recibiría el `index.html` y fallaría al leerlo como JSON.
`humo.spec.ts` lo comprueba explícitamente para que un cambio ahí se note con un fallo con
nombre.

## Estado de la accesibilidad

**Medido el 4 de septiembre de 2026.** Las cuatro pantallas del flujo —Resumen, listado de
planes, detalle con su matriz y Atributos del Graduado— pasan `axe-core` contra `wcag2a`,
`wcag2aa`, `wcag21a` y `wcag21aa` **sin ninguna violación**. No hay reglas desactivadas ni
excepciones registradas.

Fue la primera medición del proyecto y no salió limpia: encontró una sola regla incumplida,
`color-contrast`, en las cuatro pantallas. Nada de etiquetas ausentes, errores de ARIA ni
orden de encabezados roto. Se arregló oscureciendo cinco colores de texto de `global.css`,
que iban de 2.56:1 a 3.80:1 donde AA exige 4.5:1. Esa desviación respecto del documento de UI
está registrada como **D-10** en la sección 8 de
`docs/requisitos/PROMPT_CLAUDE_CODE_PLAN_ESTUDIOS_UI.md`, **aprobada el 4 de septiembre de
2026**: cumplir el estándar pesa más que la lista literal de colores del documento.

**Cobertura actual (26 de septiembre de 2026).** Además de las cuatro pantallas de
aquella primera medición, el spec tiene hoy 20 pruebas de `axe` (el «21» que figuraba aquí
antes no coincidía con el fichero): listados y detalles de medición, evaluación y mejora (con
sus pestañas de Documentos y Versiones ya con datos reales), Atributos del Graduado, el
resumen, las vistas de inicio de Administrador, Director y Docente, la página Mis evidencias,
desde RF127 el selector de competencias con una competencia sin atributo —la casilla
deshabilitada y su motivo enlazado por `aria-describedby`— y las Actas de Aprobación: el
listado con una acta ya creada y el detalle de un acta en Borrador con una fila de asistente
en blanco y su historial. Todas pasan sin violaciones y sin reglas desactivadas. Actas queda
cubierta solo en **Borrador**: el detalle de un acta Aprobada o Emitida (campos
deshabilitados, aviso de solo lectura, sección de exportación) y el modal de rechazo no se
analizan, porque llegar a ellos exige aprobar un acta con acciones cargadas. Tampoco hay `axe`
sobre el estado «ya marcada» de la casilla de RF127 (un plan no puede llegar a él por la
interfaz: la API lo impide, así que solo lo cubren las pruebas de componente).

**Automatizado no es completo.** `axe-core` detecta alrededor de un tercio de los problemas
reales de accesibilidad. Si el orden de tabulación tiene sentido, si un texto alternativo
describe de verdad la imagen, si el flujo se puede completar solo con teclado de principio a
fin: nada de eso lo ve una máquina. §6.4 pide además revisión manual en Staging antes de un
release mayor, y sigue haciendo falta.
