/**
 * Se ejecuta una vez antes de toda la suite de integración.
 *
 * Aquí solo vive la salvaguarda de la base: cortar en el `setupFiles` detiene
 * la ejecución entera antes de que ningún TRUNCATE llegue a correr, que es lo
 * único que sirve. Comprobarlo dentro de cada archivo dejaría que el primero en
 * arrancar hiciera daño.
 */

import { exigirBaseDesechable } from './exigir-base-desechable.js';

exigirBaseDesechable();
