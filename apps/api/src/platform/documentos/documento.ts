/**
 * Modelo neutro de documento.
 *
 * Es la pieza que separa QUÉ dice un documento de CÓMO se dibuja. El contenido
 * —qué asignaturas entran, cómo se agrupan, qué se declara cuando el plan está
 * vacío— es material de acreditación y se decide aquí, en dominio puro, donde
 * puede probarse sin abrir un PDF ni levantar nada.
 *
 * El renderizado vive en `infrastructure/documents/`. Hoy hay dos adaptadores
 * —PDFKit y ExcelJS— consumiendo este mismo modelo, y si mañana el PDF pasa a
 * generarse con Puppeteer (§4.2 deja las dos opciones abiertas), lo que se
 * reescribe es el renderizador; ni una línea de lo que el documento dice.
 *
 * El modelo es deliberadamente pobre: títulos, párrafos y tablas. No tiene
 * colores, fuentes ni coordenadas. Meterlos aquí devolvería las decisiones de
 * presentación al dominio, que es justo lo que esta separación evita.
 */

export type Alineacion = 'izquierda' | 'derecha';

export interface Columna {
  readonly titulo: string;
  /**
   * Peso relativo del ancho, no una medida.
   *
   * El dominio no sabe cuánto mide una página, y una columna en centímetros
   * daría un resultado distinto en A4 que en una hoja de cálculo. El
   * renderizador reparte el espacio que tenga según estos pesos.
   */
  readonly peso: number;
  /** Los números se leen mejor a la derecha; por defecto, izquierda. */
  readonly alineacion?: Alineacion;
}

export interface Tabla {
  readonly columnas: readonly Columna[];
  readonly filas: readonly (readonly string[])[];
  /**
   * Qué decir cuando no hay ni una fila.
   *
   * Obligatorio y no opcional a propósito. RF072 y RF073 piden que el documento
   * se genere igual cuando el plan no tiene asignaturas, «indicando la ausencia
   * de contenido»: una tabla que aparece vacía y sin explicación no distingue
   * un plan sin asignaturas de un fallo al generarlo.
   */
  readonly siVacia: string;
}

export interface Seccion {
  readonly titulo: string;
  readonly parrafos?: readonly string[];
  readonly tabla?: Tabla;
}

/** Un dato de cabecera: «Carrera: Ingeniería de Sistemas e Informática». */
export interface Metadato {
  readonly etiqueta: string;
  readonly valor: string;
}

export interface Documento {
  /** Nombre del archivo sin extensión. La pone el renderizador. */
  readonly nombreArchivo: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly metadatos: readonly Metadato[];
  readonly secciones: readonly Seccion[];
  /**
   * Nota al pie, presente en todas las páginas.
   *
   * Aquí es donde el documento declara su propia procedencia. Un PDF que sale
   * de este sistema y acaba en un expediente de acreditación tiene que poder
   * decir de dónde salió y cuándo, o no vale como evidencia de nada.
   */
  readonly pie: string;
}

/** Formato de fecha estable, sin depender de la configuración regional del servidor. */
export function fechaLegible(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`;
}

/** Igual que `fechaLegible`, con hora: para trazas donde el día no basta. */
export function fechaYHoraLegible(fecha: Date): string {
  const hh = String(fecha.getUTCHours()).padStart(2, '0');
  const min = String(fecha.getUTCMinutes()).padStart(2, '0');
  return `${fechaLegible(fecha)} ${hh}:${min} UTC`;
}
