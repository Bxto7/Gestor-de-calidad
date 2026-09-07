/**
 * Lo mínimo que `auth` expone para poner un nombre donde hay un identificador.
 *
 * Un documento de acreditación que dice «Aprobado por
 * 3f2b…-9c1e» no sirve de evidencia: lo lee una persona. Pero el nombre vive en
 * `auth` y CLAUDE.md §3.2 prohíbe que otro módulo consulte sus tablas, así que
 * se pide por aquí — igual que `plan-estudios` pide los permisos por
 * `AuthorizationPort` en vez de mirar `usuarios`.
 *
 * Deliberadamente pobre: solo nombres, y solo los que se piden. Devolver
 * `DatosUsuario` entero convertiría este puerto en una puerta trasera al
 * módulo de usuarios, que es justo lo que evita.
 */

export interface DirectorioDeUsuariosPort {
  /**
   * Nombre legible de cada identificador que exista, indexado por id.
   *
   * Los que no existan simplemente no aparecen en el mapa. Una cuenta borrada
   * no debe hacer fallar la generación de un documento sobre hechos que sí
   * ocurrieron: el registro de la aprobación sobrevive a la cuenta que la hizo.
   */
  nombresDe(ids: readonly string[]): Promise<Map<string, string>>;

  /**
   * Cuentas **activas** con ese rol, para elegir un responsable.
   *
   * Las inactivas no salen: no se puede responsabilizar de una evaluación a una
   * cuenta apagada. Las que ya estén guardadas como responsables siguen
   * resolviéndose por `nombresDe`, que no filtra por estado — el registro
   * histórico se conserva aunque la persona ya no esté.
   */
  porRol(codigoRol: string): Promise<{ id: string; nombre: string }[]>;
}

export const DIRECTORIO_USUARIOS = Symbol('DirectorioDeUsuariosPort');
