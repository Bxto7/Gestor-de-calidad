/**
 * Los once atributos del graduado que exige ICACIT (CLAUDE.md §6.2).
 *
 * Son el estándar contra el que se acredita, no un dato de una universidad. Desde
 * el Bloque 5 cada carrera tiene **sus propias filas**: esta constante es el
 * molde con el que las siembras de desarrollo y de e2e dan a una carrera sus
 * atributos. En producción no hay siembra: la migración copió los existentes a
 * cada carrera, y una carrera nueva empieza sin ninguno (decisión 2).
 *
 * Que estén los once —incluidos los que ninguna competencia cubra todavía— es lo
 * que permite responder «¿qué atributo se nos quedó sin cubrir?»: lo que falta no
 * estaría escrito en ninguna parte si solo se guardara lo mapeado.
 */

/** Marco de acreditación vigente. §1 anticipa otros; hoy solo se siembra este. */
export const MARCO_ICACIT = 'ICACIT';

export interface AtributoDelMarco {
  readonly codigo: string;
  readonly nombre: string;
}

export const ATRIBUTOS_ICACIT: readonly AtributoDelMarco[] = [
  { codigo: 'AG-I01', nombre: 'El Profesional y el Mundo' },
  { codigo: 'AG-I02', nombre: 'Ética' },
  { codigo: 'AG-I03', nombre: 'Trabajo Individual y en Equipo' },
  { codigo: 'AG-I04', nombre: 'Comunicación' },
  { codigo: 'AG-I05', nombre: 'Gestión de Proyectos' },
  { codigo: 'AG-I06', nombre: 'Aprendizaje a lo largo de la vida' },
  { codigo: 'AG-I07', nombre: 'Conocimientos de Ingeniería' },
  { codigo: 'AG-I08', nombre: 'Análisis de Problema' },
  { codigo: 'AG-I09', nombre: 'Diseño y Desarrollo de Soluciones' },
  { codigo: 'AG-I10', nombre: 'Indagación' },
  { codigo: 'AG-I11', nombre: 'Uso de Herramientas' },
];
