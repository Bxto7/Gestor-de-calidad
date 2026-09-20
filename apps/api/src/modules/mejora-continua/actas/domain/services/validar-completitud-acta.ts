/**
 * Validación integral de completitud del acta (RF-AC-016).
 *
 * Requisito previo obligatorio para enviar a revisión y para aprobar (RN1).
 * Devuelve todos los motivos a la vez, no el primero que falla — mismo
 * criterio que `motor-de-consistencia.ts` de los submódulos hermanos: quien
 * corrige el acta necesita ver de una vez todo lo que le falta.
 *
 * Archivo puro: no importa NestJS, ni Prisma, ni nada de infraestructura.
 */

export interface DatosParaCompletitud {
  readonly convocadaPor: string;
  readonly fechaReunion: Date;
  readonly lugarReunion: string;
  readonly lugarEmision: string | null;
  readonly fechaEmision: Date | null;
  readonly asistentes: readonly unknown[];
  readonly acciones: readonly { readonly incluida: boolean }[];
}

export interface ResultadoCompletitudActa {
  readonly tieneBloqueos: boolean;
  readonly motivos: readonly string[];
}

/** Centinela con el que `crear()` inicializa `fechaReunion` (2c-AC-A). */
const FECHA_REUNION_SIN_COMPLETAR = new Date(0).getTime();

export function validarCompletitudActa(datos: DatosParaCompletitud): ResultadoCompletitudActa {
  const motivos: string[] = [];

  // RF-AC-003/004/006: la cabecera nace vacía y se completa con `editarCabecera`.
  if (
    !datos.convocadaPor.trim() ||
    !datos.lugarReunion.trim() ||
    datos.fechaReunion.getTime() === FECHA_REUNION_SIN_COMPLETAR
  ) {
    motivos.push('Completa los datos de convocatoria, fecha y lugar de la reunión.');
  }

  // RF-AC-005.
  if (datos.asistentes.length === 0) {
    motivos.push('Registra al menos un asistente.');
  }

  // RF-AC-008 RN1.
  if (!datos.acciones.some((a) => a.incluida)) {
    motivos.push('Incluye al menos una acción de mejora.');
  }

  // Lugar y fecha de emisión.
  if (!datos.lugarEmision?.trim() || !datos.fechaEmision) {
    motivos.push('Define el lugar y la fecha de emisión del acta.');
  }

  return { tieneBloqueos: motivos.length > 0, motivos };
}
