/**
 * La regla única de «vigente» para los planes de Mejora (Bloque 6b, decisión 3).
 *
 * Con varias versiones aprobadas de un linaje, cuenta como vigente **la última
 * aprobada**: una aprobada que no tiene otra aprobada derivada de ella, directa
 * o más abajo. Se calcula; no hay un estado «Vigente» que mantener. La usan
 * `gestionar-actas` (qué planes se ofrecen al cargar el acta), el repositorio del
 * resumen de carrera y nadie más: si una pantalla o una consulta necesita «el plan
 * en vigor», llama aquí en lugar de reescribir la regla.
 *
 * Genérica sobre el tipo de plan y sobre cómo se reconoce «aprobado»: el dominio
 * compartido no conoce el tipo de estado de cada consumidor (`'Aprobado'` en los
 * casos de uso, `'APROBADO'` en las filas de base de datos del resumen).
 *
 * Una rama —dos hijos aprobados del mismo origen— deja dos vigentes: el esquema y
 * `permiteVersionadoMejora` la permiten, y esta función no decide cuál «gana».
 * Un `derivadoDeId` cíclico (dato corrupto) no cuelga el cálculo.
 */

export function ultimasAprobadasDelLinaje<
  T extends { readonly id: string; readonly derivadoDeId: string | null },
>(planes: readonly T[], esAprobado: (plan: T) => boolean): T[] {
  const porId = new Map(planes.map((p) => [p.id, p] as const));
  const superadas = new Set<string>();

  for (const plan of planes) {
    if (!esAprobado(plan)) continue;
    // Todo ancestro de una aprobada queda superado por ella.
    const vistos = new Set<string>([plan.id]);
    let ancestro = plan.derivadoDeId;
    while (ancestro && !vistos.has(ancestro)) {
      vistos.add(ancestro);
      superadas.add(ancestro);
      ancestro = porId.get(ancestro)?.derivadoDeId ?? null;
    }
  }

  return planes.filter((p) => esAprobado(p) && !superadas.has(p.id));
}
