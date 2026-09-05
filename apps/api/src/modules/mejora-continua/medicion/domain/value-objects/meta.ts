/**
 * La meta del plan de medición (RF-PM-011, RF-PM-012).
 *
 * RN1: es un único valor para todas las competencias del plan; no se define por
 * competencia. Aquí eso se cumple por ausencia de la alternativa — no hay forma
 * de expresar una meta por competencia, porque la función toma y devuelve un
 * número suelto.
 *
 * RN2: se almacena como fracción decimal y no como porcentaje. La interfaz
 * habla en porcentajes, así que hay un cruce de unidades en cada lectura y en
 * cada escritura, y conviene que viva en un solo sitio.
 */

import { ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';

/** Tres decimales de fracción: lo que cabe en la columna `Decimal(4,3)`. */
const DECIMALES = 3;

export function metaDesdePorcentaje(porcentaje: number): number {
  if (!Number.isFinite(porcentaje)) {
    throw new ReglaDeNegocioViolada('La meta debe ser un número.');
  }

  // RF-PM-012 RN1: ambos extremos incluidos.
  if (porcentaje < 0 || porcentaje > 100) {
    throw new ReglaDeNegocioViolada(
      `La meta debe estar entre 0 % y 100 %; se recibió ${porcentaje} %.`,
    );
  }

  // Se redondea después de dividir: 70.5 / 100 da 0.7050000000000001, y sin
  // esto la columna guardaría un valor que no vuelve a leerse igual. Un umbral
  // de aprobación no debe depender de cómo se representa un binario.
  return Number((porcentaje / 100).toFixed(DECIMALES));
}

export function porcentajeDeMeta(fraccion: number): number {
  return Number((fraccion * 100).toFixed(1));
}
