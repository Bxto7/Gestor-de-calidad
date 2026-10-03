/**
 * `axe-core` sobre las pantallas del flujo de Mejora Continua.
 *
 * Automatizado no es completo: axe detecta alrededor de un tercio de los
 * problemas reales de accesibilidad. Lo que no puede ver —si el orden de
 * tabulación tiene sentido, si un texto alternativo describe la imagen— sigue
 * necesitando a una persona. Esta suite cubre lo que una máquina sí puede.
 */

import type { Page } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { analizar } from '../fixtures/axe';
import { borradorNuevo, borrarPlan, cabeceras } from '../fixtures/plan-borrador';
import { completarDefinicion } from '../fixtures/plan-mejora';
import { expect, paginaComo, test } from '../fixtures/sesion';
import { API } from '../global-setup';

/**
 * Crea un plan de evaluación fresco sobre la base Indirecta de la semilla y
 * abre su detalle. Sirve de punto de partida a las dos pruebas de Documentos
 * y Versiones de más abajo.
 *
 * La base Indirecta y no la Directa: este fichero corre alfabéticamente antes
 * que `configuracion-evaluacion.spec.ts`, que depende de que «el plan Directo
 * más reciente» siga siendo el mismo entre sus dos pruebas. Crear aquí un
 * Directo más lo desplazaría. El tipo de plan es irrelevante para lo que estas
 * dos pruebas comprueban.
 */
async function crearPlanEvaluacion(page: Page): Promise<void> {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByLabel('Plan de medición base*')
    .selectOption({ label: 'PM-PE-E2E-v1-I-v1 — Aprobado' });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  const enlace = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

test('el listado de planes de medición', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();

  await analizar(page, 'el listado de planes de medición');
});

test('el detalle, con su matriz', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await analizar(page, 'el detalle del plan de medición');
});

test('el selector de competencias, con una sin atributo del graduado (RF127)', async ({ page }) => {
  // Un plan propio y en Borrador: es el único estado en que el selector se puede
  // editar, y por tanto el único en que la casilla deshabilitada por RF127 lleva su
  // motivo. Crearlo aquí y no tomar «el primero» del listado, que puede ser
  // cualquiera de los que dejan otros ficheros.
  await page.goto('/mejora-continua/medicion');
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Meta (%)*' }).fill('70');
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  const enlace = page.getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // Con el estado real delante: analizar sin haber visto la casilla no distingue
  // «sin problemas» de «axe nunca vio el motivo».
  const sinAtributo = page.getByRole('checkbox', { name: /CPE-E2E05/ });
  await expect(sinAtributo).toBeDisabled();
  await expect(sinAtributo).toHaveAccessibleDescription(/para poder incluirla/);

  await analizar(page, 'el selector de competencias con una sin atributo del graduado');
});

test('el listado de planes de evaluación', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await expect(page.getByRole('heading', { name: 'Planes de evaluación' })).toBeVisible();

  await analizar(page, 'el listado de planes de evaluación');
});

test('el detalle de evaluación, con la cuadrícula de lo heredado', async ({ page }) => {
  // La tabla por atributo con `caption`, `scope="row"` y columna fija es
  // estructura nueva: el resto de la pantalla calca la de medición, pero esa
  // cuadrícula no existía en ninguna otra parte.
  //
  // Filtrado por tipo Directa a propósito: desde la Task 7 la semilla también
  // trae un plan de medición Indirecta, y el test siguiente de este fichero
  // crea su propio plan de evaluación sobre él — sin el filtro, «el más
  // reciente» dejaría de ser fiable en cuanto ese test se ejecutara antes.
  await page.goto('/mejora-continua/evaluacion');
  await page.getByLabel('Filtrar por tipo').selectOption('DIRECTA');
  const primero = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Heredado del plan de medición' })).toBeVisible();

  // RF-PE-013 a RF-PE-021: en 2c-A la matriz base no programaba ningún cruce,
  // así que esta tarjeta solo mostraba su estado vacío y axe nunca llegó a ver
  // un campo de verdad. Con al menos una competencia programada (§ fixture
  // E2E), se despliega una fila real —con su propio selector de asignatura y
  // de docente— antes de analizar.
  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();
  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-I' });
  await page.getByRole('button', { name: 'Añadir asignatura' }).click();

  await analizar(page, 'el detalle del plan de evaluación');
});

test('el detalle de un plan de evaluación indirecta, con sus indicaciones', async ({ page }) => {
  // `ConfiguracionDelAnio` es una tarjeta hermana de la directa, no una rama
  // suya (RF-PE-022 a RF-PE-030): tiene su propia mitad de campos —responsable
  // por competencia e indicaciones por grupo objetivo, sin cruce con
  // asignaturas— que la pantalla directa nunca pinta. Sin abrirla, axe nunca
  // llegaría a analizar el selector de grupo objetivo ni los campos de una
  // indicación.
  //
  // Crea su propio plan de evaluación sobre el plan de medición Indirecta de
  // la semilla (`PM-PE-E2E-v1-I-v1`, Task 7): por orden alfabético este
  // fichero corre antes que `configuracion-indirecta.spec.ts`, que es quien
  // tiene el suyo, y ninguno de los dos puede compartirlo con el otro.
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByLabel('Plan de medición base*')
    .selectOption({ label: 'PM-PE-E2E-v1-I-v1 — Aprobado' });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  await page.getByLabel('Filtrar por tipo').selectOption('INDIRECTA');
  const primero = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Heredado del plan de medición' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();

  // Con contenido real: en 2c-A se analizó el estado vacío y axe no llegó a
  // ver ningún campo. Selecciona el año y añade una indicación antes de
  // analizar, tal como pide la Task 7.
  await page.getByLabel('Año a configurar').selectOption({ label: '2026' });
  await page.getByRole('button', { name: 'Añadir indicación' }).click();

  await analizar(page, 'el detalle del plan de evaluación indirecta');
});

test('los atributos del graduado', async ({ page }) => {
  await page.goto('/acreditacion/atributos');
  await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();

  await analizar(page, 'la pantalla de atributos');
});

test('el resumen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

  await analizar(page, 'el resumen');
});

test('la pestaña de documentos del plan de evaluación, con un PDF ya generado', async ({
  page,
}) => {
  // Con contenido real: analizar la lista vacía no distingue «sin problemas»
  // de «axe nunca llegó a ver la fila de un documento», que es justo el
  // defecto de 2c-A que esta suite ya corrigió una vez para otras pantallas.
  await crearPlanEvaluacion(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: 'Generar PDF' }).click();
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 30_000 });

  await analizar(page, 'la pestaña de documentos del plan de evaluación');
});

test('el listado de planes de mejora', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await expect(page.getByRole('heading', { name: 'Planes de Mejora' })).toBeVisible();

  await analizar(page, 'el listado de planes de mejora');
});

test('el detalle de un plan de mejora', async ({ page }) => {
  // Con contenido real: este fichero corre alfabéticamente antes que
  // `plan-mejora.spec.ts`, así que todavía no hay ningún plan de mejora
  // sembrado — se crea uno al vuelo, igual que `crearPlanEvaluacion` de más
  // arriba hace para Documentos y Versiones.
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await analizar(page, 'el detalle del plan de mejora');
});

/**
 * Crea un plan de mejora fresco (Criterio de Acreditación) y abre su detalle.
 * Sirve de punto de partida a las dos pruebas de Documentos y Versiones de
 * más abajo — mismo papel que `crearPlanEvaluacion` para su gemelo.
 */
async function crearPlanMejora(page: Page): Promise<void> {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

test('la pestaña de documentos del plan de mejora, con un PDF ya generado', async ({ page }) => {
  // Con contenido real: analizar la lista vacía no distingue «sin
  // problemas» de «axe nunca llegó a ver la fila de un documento» — mismo
  // motivo que la prueba gemela de Evaluación de más arriba.
  await crearPlanMejora(page);

  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: 'Generar PDF' }).click();
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 30_000 });

  await analizar(page, 'la pestaña de documentos del plan de mejora');
});

/**
 * Crea un acta de aprobación fresca en Borrador y abre su detalle. El periodo
 * lleva la hora para que dos corridas seguidas sin reiniciar la base no choquen
 * ni se confundan entre sí.
 */
async function crearActa(page: Page): Promise<void> {
  await page.goto('/mejora-continua/actas');
  await page.getByRole('button', { name: 'Nueva acta' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Periodo académico*').fill(`E2E-AXE-${Date.now()}`);
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Cabecera del acta' })).toBeVisible();
}

test('el listado de actas de aprobación, con una acta ya creada', async ({ page }) => {
  // Con contenido real: analizar el estado vacío no distingue «sin problemas» de
  // «axe nunca vio la tabla», que es lo que el resto de este fichero ya evita.
  await crearActa(page);
  await page.goto('/mejora-continua/actas');
  await expect(page.getByRole('heading', { name: 'Actas de aprobación' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Actas de aprobación registradas' })).toBeVisible();

  await analizar(page, 'el listado de actas de aprobación');
});

test('el detalle de un acta en Borrador, con sus campos editables', async ({ page }) => {
  // Borrador es el único estado en que todos los campos están habilitados y en
  // que aparecen los botones de guardar, quitar y eliminar. Se añade una fila de
  // asistente en blanco antes de analizar: es el campo dinámico de la pantalla y
  // el que más fácilmente pierde su etiqueta.
  await crearActa(page);
  await page.getByRole('button', { name: 'Agregar asistente' }).click();
  await expect(page.getByLabel('Asistente 1')).toBeVisible();

  // El historial ya trae el evento de creación: sin esperarlo, axe vería el
  // estado vacío o la carga en su lugar.
  await expect(page.getByRole('list', { name: 'Movimientos del acta' })).toBeVisible();

  await analizar(page, 'el detalle del acta de aprobación en Borrador');
});

/**
 * Pulsa un botón del acta y espera a que el servidor confirme el cambio (una
 * escritura a `/actas/...` con respuesta correcta). El acta se arma paso a paso y
 * cada paso valida contra lo ya guardado: pulsar «Enviar a revisión» antes de que
 * el servidor tenga la cabecera fallaría con «Hay inconsistencias bloqueantes» sin
 * decir cuál.
 */
async function pulsarYEsperarGuardado(page: Page, nombre: string): Promise<void> {
  const [respuesta] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() !== 'GET' && new URL(r.url()).pathname.includes('/actas/'),
    ),
    page.getByRole('button', { name: nombre, exact: true }).click(),
  ]);
  expect(respuesta.ok(), `«${nombre}» no se guardó (${respuesta.status()}).`).toBe(true);
}

/**
 * Deja un acta En revisión, recorriendo la interfaz como lo haría quien la arma.
 *
 * Enviar a revisión exige la validación integral de RF-AC-016: cabecera, un asistente,
 * al menos una acción incluida y los datos de emisión. Las acciones salen de los planes
 * de mejora Aprobados o Vigentes de la carrera que no estén ya en un acta emitida,
 * así que cada llamada aprueba antes su propio plan de mejora: no depende de lo que
 * hayan dejado otros ficheros ni de que una corrida anterior no lo haya gastado.
 * Los permisos se reparten: `page` va con la cuenta `director` (`actas.*`) y el plan
 * de mejora lo aprueba el Coordinador (`mejora.aprobar`) en una pestaña aparte.
 */
async function crearActaEnRevision(page: Page): Promise<void> {
  const coordinador = await paginaComo(page, 'editor');
  try {
    await crearPlanMejora(coordinador);
    await completarDefinicion(coordinador);
    await coordinador.getByRole('button', { name: 'Enviar a revisión' }).click();
    await coordinador.getByRole('button', { name: 'Aprobar', exact: true }).click();
    // Sin cerrar antes: la pestaña abandonaría la página antes de que el servidor
    // termine de aprobar el plan, y el acta no encontraría ninguna acción que cargar.
    await expect(coordinador.getByRole('button', { name: 'Aprobar', exact: true })).toBeHidden();
  } finally {
    await coordinador.close();
  }

  await crearActa(page);
  await page.getByLabel('Convocada por').fill('Dirección de la carrera');
  await page.getByLabel('Fecha de reunión').fill('2026-09-01');
  await page.getByLabel('Lugar de reunión').fill('Sala de reuniones');
  await page.getByLabel('Lugar de emisión').fill('Huancayo');
  await page.getByLabel('Fecha de emisión').fill('2026-09-02');
  await pulsarYEsperarGuardado(page, 'Guardar cabecera');

  await page.getByRole('button', { name: 'Agregar asistente' }).click();
  await page.getByLabel('Asistente 1').fill('E2E Director');
  await pulsarYEsperarGuardado(page, 'Guardar asistentes');

  await pulsarYEsperarGuardado(page, 'Cargar acciones del periodo');
  const acciones = page.getByRole('table', { name: 'Acciones de mejora incluidas en el acta' });
  await expect(acciones.getByRole('checkbox').first()).toBeChecked();

  await pulsarYEsperarGuardado(page, 'Enviar a revisión');
  // Aprobar solo aparece con el acta ya En revisión: esperarlo confirma que el
  // servidor y la pantalla coinciden antes de que la prueba haga nada más.
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toBeVisible();
}

/** Lo mismo que `crearActaEnRevision`, y además la aprueba (RF-AC-014). */
async function crearActaAprobada(page: Page): Promise<void> {
  await crearActaEnRevision(page);
  await pulsarYEsperarGuardado(page, 'Aprobar');
  await expect(page.getByRole('note')).toContainText(
    'Esta acta está Aprobada y no admite cambios.',
  );
}

test.describe('con la cuenta que aprueba', () => {
  // Generar una versión exige `evaluacion.crear`/`mejora.crear` y aprobar
  // exige `evaluacion.aprobar`/`mejora.aprobar`. Desde el Bloque 1 la cuenta
  // por defecto (`editor` → COORDINADOR_ACADEMICO) tiene los cuatro
  // (`matriz-de-accesos.ts`): no hace falta cambiar de rol.

  test('la pestaña de versiones del plan de evaluación, con un linaje real', async ({ page }) => {
    await crearPlanEvaluacion(page);

    // RF-PE-034 RN: «Generar nueva versión» solo cabe desde Aprobado, Vigente
    // o Histórico — hace falta salir de Borrador primero.
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

    await page.getByRole('tab', { name: 'Versiones' }).click();
    await page.getByRole('button', { name: 'Generar nueva versión' }).click();

    // La operación navega a la copia nueva y reinicia la pestaña activa a
    // Documentos: se espera ese reinicio (evidencia de que la navegación ya
    // ocurrió) antes de volver a pedir Versiones, para no pulsar la pestaña
    // vieja un instante antes de que la página cambie por debajo.
    await expect(page.getByRole('tab', { name: 'Documentos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Versiones' }).click();
    await expect(page.getByRole('link', { name: /^EV-/ })).toBeVisible();

    await analizar(page, 'la pestaña de versiones del plan de evaluación');
  });

  test('la pestaña de versiones del plan de mejora, con un linaje real', async ({ page }) => {
    await crearPlanMejora(page);

    // RF-PJ-035 RN (misma regla que RF-PE-034 en Evaluación): «Generar nueva
    // versión» solo cabe desde Aprobado, Vigente o Histórico — hace falta
    // salir de Borrador primero, y RF-PJ-042 no deja salir con la definición
    // incompleta.
    await completarDefinicion(page);
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

    await page.getByRole('tab', { name: 'Versiones' }).click();
    await page.getByRole('button', { name: 'Generar nueva versión' }).click();

    // La operación navega a la copia nueva y reinicia la pestaña activa a
    // Definición —el primer valor de `useState<Pestana>('definicion')` en
    // `PlanMejoraPage.tsx`, a diferencia de Evaluación que reinicia a
    // Documentos—: se espera ese reinicio (evidencia de que la navegación ya
    // ocurrió) antes de volver a pedir Versiones, para no pulsar la pestaña
    // vieja un instante antes de que la página cambie por debajo.
    await expect(page.getByRole('tab', { name: 'Definición' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Versiones' }).click();
    // Como en la prueba gemela de Evaluación: con la versión original y la
    // recién creada en la misma tabla, `(viendo esta)` y el enlace `PJ-...`
    // están los dos visibles a la vez — combinarlos con `.or()` viola el modo
    // estricto de Playwright (dos elementos, no uno). Basta el enlace a la
    // versión original.
    await expect(page.getByRole('link', { name: /^PJ-/ })).toBeVisible();

    await analizar(page, 'la pestaña de versiones del plan de mejora');
  });
});

test.describe('con las cuentas que aprueban planes y actas', () => {
  // Las actas las arma y aprueba el Director (`actas.*`); los planes de mejora
  // de los que salen sus acciones los aprueba el Coordinador. Por eso `page` va
  // como `director` y `crearActaEnRevision` abre al Coordinador en otra pestaña.
  test.use({ rol: 'director' });

  test('el detalle de un acta Aprobada, en solo lectura y con su exportación', async ({ page }) => {
    // Es el estado que el aviso de RF-AC-021 y la sección de exportación (RF-AC-018/019)
    // pintan: campos deshabilitados, sin botones de guardar y con «Exportar PDF».
    await crearActaAprobada(page);
    await expect(page.getByRole('heading', { name: 'Exportar el acta' })).toBeVisible();
    await expect(page.getByLabel('Convocada por')).toBeDisabled();
    await expect(page.getByRole('list', { name: 'Movimientos del acta' })).toBeVisible();

    await analizar(page, 'el detalle del acta de aprobación Aprobada');
  });

  test('el detalle de un acta Emitida, con su PDF ya exportado', async ({ page }) => {
    // Emitida no tiene botón: la primera exportación que termina bien pasa el acta de
    // Aprobada a Emitida (RF-AC-018/019), y eso lo hace el worker. Sin él, esta prueba
    // se queda esperando «Listo».
    await crearActaAprobada(page);
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    const documentos = page.getByRole('list', { name: 'Documentos exportados' });
    await expect(documentos.getByText('Listo')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('note')).toContainText(
      'Esta acta está Emitida y no admite cambios.',
    );

    await analizar(page, 'el detalle del acta de aprobación Emitida');
  });

  test('el detalle de un acta En revisión, con Aprobar y Rechazar', async ({ page }) => {
    // En revisión ya no se edita, pero tampoco lleva el aviso de solo lectura de
    // RF-AC-021: está en manos de quien aprueba o rechaza. Es el único estado en que
    // «Aprobar» y «Rechazar» conviven en la fila de transición.
    await crearActaEnRevision(page);
    await expect(page.getByRole('button', { name: 'Rechazar', exact: true })).toBeVisible();
    await expect(page.getByLabel('Convocada por')).toBeDisabled();

    await analizar(page, 'el detalle del acta de aprobación En revisión');
  });

  test('el modal de rechazo de un acta, con el motivo escrito', async ({ page }) => {
    // El modal exige motivo (RF-AC-015 RN1). Se abre y se rellena antes de analizar:
    // con el campo vacío y el botón «Confirmar» deshabilitado axe vería solo la mitad
    // de lo que un usuario ve.
    await crearActaEnRevision(page);
    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByLabel('Motivo del rechazo').fill('Falta detallar los recursos de la acción.');
    await expect(modal.getByRole('button', { name: 'Confirmar' })).toBeEnabled();

    await analizar(page, 'el modal de rechazo del acta de aprobación');
  });
});

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

test.describe('con la cuenta de docente', () => {
  // «Mis evidencias» depende del permiso `evidencia.registrar`, que solo tiene el
  // rol Docente. Sin evaluaciones asignadas en un plan de evaluación vigente
  // —el estado de esta cuenta en la base de pruebas— la página muestra su estado
  // vacío; el estado con datos lo cubren las pruebas de componente. Lo mismo vale
  // para el inicio: con cero evaluaciones enseña los KPIs en cero y «Estás al día».
  test.use({ rol: 'docente' });

  test('la vista de inicio del docente', async ({ page }) => {
    await page.goto('/');
    // Con contenido real: esperar al saludo —«Hola, E2E», por el nombre «E2E
    // Docente» de la cuenta— descarta analizar el esqueleto de carga, que no
    // distingue «sin problemas» de «axe nunca vio los datos».
    await expect(page.getByRole('heading', { level: 1, name: 'Hola, E2E' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Cargando tu resumen' })).toBeHidden();

    await analizar(page, 'la vista de inicio del docente');
  });

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

test.describe('Objetivos y Competencias del plan, con el modal de eliminar abierto', () => {
  test.use({ rol: 'director' });

  test('la sección Competencias de un Borrador', async ({ page, request }) => {
    const planId = await borradorNuevo(request);
    try {
      await page.goto(`/plan-estudios/planes/${planId}/competencias`);
      // Con contenido real: el Borrador trae las competencias del Vigente.
      const fila = page.getByRole('row').filter({ hasText: 'CPE-E2E02' });
      await fila.getByRole('button', { name: 'Eliminar' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Eliminar competencia del plan' }),
      ).toBeVisible();

      await analizar(page, 'Competencias del plan con el modal de eliminar');
    } finally {
      await borrarPlan(request, planId);
    }
  });

  test('la sección Objetivos de un Borrador', async ({ page, request }) => {
    const planId = await borradorNuevo(request);
    try {
      const h = cabeceras(await tokenDe('director'));
      const creado = await request.post(`${API}/objetivos`, {
        headers: h,
        data: {
          planId,
          nombre: `Objetivo para axe ${Date.now().toString().slice(-7)}`,
          descripcion: 'Objetivo creado por la suite E2E para analizar la pantalla.',
        },
      });
      expect(creado.ok()).toBe(true);
      const { id, codigo } = (await creado.json()) as { id: string; codigo: string };

      await page.goto(`/plan-estudios/planes/${planId}/objetivos`);
      await page
        .getByRole('row')
        .filter({ hasText: codigo })
        .getByRole('button', { name: 'Eliminar' })
        .click();
      await expect(page.getByRole('dialog', { name: 'Eliminar objetivo del plan' })).toBeVisible();

      await analizar(page, 'Objetivos del plan con el modal de eliminar');

      // Solo estaba en este Borrador: quitarlo borra el registro y no deja restos.
      await request.delete(`${API}/planes/${planId}/objetivos/${id}`, { headers: h });
    } finally {
      await borrarPlan(request, planId);
    }
  });
});
