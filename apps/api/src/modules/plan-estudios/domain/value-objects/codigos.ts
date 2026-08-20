/**
 * Generación de códigos autogenerados (§4: "todos los códigos se autogeneran y
 * son de solo lectura"). Funciones puras, sin estado propio: reciben lo que ya
 * existe y devuelven el siguiente código.
 *
 * Facultad no lleva código: la especificación lo excluye explícitamente.
 *
 * Compartido literalmente con el frontend. La normalización de unicidad tiene
 * además una tercera copia como índice de expresión en la migración inicial;
 * las tres deben tratar la eñe igual.
 */

/** RF034 — OE-01, OE-02… */
export function siguienteCodigoObjetivo(codigosExistentes: readonly string[]): string {
  return correlativo('OE', codigosExistentes);
}

/** RF041 — CPE-01, CPE-02… */
export function siguienteCodigoCompetencia(codigosExistentes: readonly string[]): string {
  return correlativo('CPE', codigosExistentes);
}

/**
 * RF053 — código estructurado por carrera: ISI-101, ISI-102…
 * Arranca en 101 para que el primer dígito sugiera el ciclo, que es como se
 * nombran los cursos en la práctica.
 */
export function siguienteCodigoAsignatura(
  codigoCarrera: string,
  codigosExistentes: readonly string[],
): string {
  const prefijo = `${codigoCarrera}-`;
  const numeros = codigosExistentes
    .filter((c) => c.startsWith(prefijo))
    .map((c) => Number.parseInt(c.slice(prefijo.length), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = numeros.length === 0 ? 101 : Math.max(...numeros) + 1;
  return `${prefijo}${siguiente}`;
}

/**
 * RF022 — código del plan: PE-<carrera>-<año>-v<versión>, p. ej. PE-ISI-2026-v1.
 * RN1: no editable manualmente, por eso no existe un setter en ninguna parte.
 */
export function codigoPlan(codigoCarrera: string, anio: number, version: number): string {
  return `PE-${codigoCarrera}-${anio}-v${version}`;
}

function correlativo(prefijo: string, codigosExistentes: readonly string[]): string {
  const numeros = codigosExistentes
    .filter((c) => c.startsWith(`${prefijo}-`))
    .map((c) => Number.parseInt(c.slice(prefijo.length + 1), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = numeros.length === 0 ? 1 : Math.max(...numeros) + 1;
  return `${prefijo}-${String(siguiente).padStart(2, '0')}`;
}

function sinDiacriticos(fragmento: string): string {
  return fragmento.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Deja el nombre como se va a mostrar: sin espacios en los extremos y sin
 * repeticiones internas.
 *
 * Colapsar los espacios de dentro no es cosmética. La unicidad los ignora, así
 * que "Ciencias   de la Salud" y "Ciencias de la Salud" son el mismo nombre;
 * si se guardara el primero tal cual, la grafía correcta quedaría bloqueada
 * para siempre por su propio duplicado. Guardando ya limpio, el problema no
 * llega a existir.
 *
 * A diferencia de `normalizarParaUnicidad`, esto conserva mayúsculas y tildes:
 * es el nombre que lee una persona, no una clave de comparación.
 */
export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

/**
 * RF006/RF015 — comparación de unicidad que no distingue mayúsculas ni espacios
 * adicionales. Se normaliza también el acento para que "Ingeniería" e
 * "Ingenieria" no convivan como facultades distintas.
 *
 * La eñe queda fuera de esa normalización porque en español **es una letra
 * propia**, no una "n" con tilde: "campaña" y "campana", o "año" y "ano", son
 * palabras distintas. Despojarla convertiría nombres legítimamente diferentes
 * en duplicados. Por eso el texto se parte por la eñe, se limpia cada trozo y
 * se vuelve a unir.
 *
 * La diéresis sí se despoja, y es correcto: en "pingüino" no marca otra letra,
 * solo indica que la u suena.
 */
export function normalizarParaUnicidad(texto: string): string {
  return texto.trim().toLowerCase().split('ñ').map(sinDiacriticos).join('ñ').replace(/\s+/g, ' ');
}

export function existeNombreDuplicado(
  nombre: string,
  existentes: readonly { id: string; nombre: string }[],
  idIgnorado?: string,
): boolean {
  const objetivo = normalizarParaUnicidad(nombre);
  return existentes.some(
    (e) => e.id !== idIgnorado && normalizarParaUnicidad(e.nombre) === objetivo,
  );
}
