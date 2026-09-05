/**
 * Cómo se agrupan las competencias por atributo del graduado (RF-PM-014).
 *
 * Vive aquí y no dentro de un caso de uso porque lo necesitan dos sitios: la
 * pantalla que deja elegir competencias y el documento que se exporta. Dos
 * implementaciones de la misma regla acabarían divergiendo, y entonces el PDF
 * que sale hacia el expediente diría algo distinto de lo que muestra la
 * pantalla desde la que se pidió.
 */

/** Lo mínimo que hace falta para agrupar. Encaja con `CompetenciaConAtributos`. */
export interface CompetenciaAgrupable {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly atributos: readonly { id: string; codigo: string; nombre: string }[];
}

export interface GrupoDeCompetencias {
  readonly atributo: { id: string; codigo: string; nombre: string } | null;
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
}

export function agruparPorAtributo(
  competencias: readonly CompetenciaAgrupable[],
): GrupoDeCompetencias[] {
  const grupos = new Map<string, GrupoDeCompetencias>();
  const sinAtributo: { id: string; codigo: string; nombre: string }[] = [];

  for (const c of competencias) {
    const resumen = { id: c.id, codigo: c.codigo, nombre: c.nombre };

    if (c.atributos.length === 0) {
      // No se descartan: que se vean es lo que delata que falta mapearlas, y
      // es justo el hallazgo que una acreditación busca.
      sinAtributo.push(resumen);
      continue;
    }

    // Una competencia con dos atributos aparece en los dos grupos. Es la
    // matriz real —«Aprendizaje autónomo» responde a AG-I06 y a AG-I08— y
    // quedarse con uno perdería la mitad del mapeo.
    for (const a of c.atributos) {
      const grupo = grupos.get(a.id);
      grupos.set(a.id, {
        atributo: a,
        competencias: [...(grupo?.competencias ?? []), resumen],
      });
    }
  }

  const ordenados = [...grupos.values()].sort((x, y) =>
    (x.atributo?.codigo ?? '').localeCompare(y.atributo?.codigo ?? ''),
  );

  // El grupo sin mapear va al final: es una excepción a señalar, no el primer
  // sitio donde alguien debería mirar.
  return sinAtributo.length > 0
    ? [...ordenados, { atributo: null, competencias: sinAtributo }]
    : ordenados;
}

/** Cómo se titula un grupo cuando el documento lo lee una persona. */
export function tituloDeGrupo(grupo: GrupoDeCompetencias): string {
  return grupo.atributo === null
    ? 'Sin atributo del graduado asignado'
    : `${grupo.atributo.codigo} — ${grupo.atributo.nombre}`;
}
