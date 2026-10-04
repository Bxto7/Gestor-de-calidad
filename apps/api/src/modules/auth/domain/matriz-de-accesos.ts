/**
 * Matriz de accesos vigente: catálogo de permisos y su asignación a cada rol.
 *
 * Vive en `domain/` y no en `prisma/seed.ts` para poder probarla sin montar
 * Prisma: `prisma/seed.ts` exige `DATABASE_URL` en el mismo módulo en el que
 * antes declaraba estos datos, así que un test no podía importarlos sin una
 * base de datos detrás. El seed importa este archivo; este archivo no sabe
 * que el seed existe.
 *
 * §3.5: los roles y sus permisos son datos, no código — este archivo es esa
 * fuente de datos, en un formato que además se puede revisar en un diff
 * legible y probar con Vitest.
 */

/* ── Catálogo de permisos ─────────────────────────────────────────────────
 * Patrón `recurso.accion`, para que el `AuthorizationPort` resuelva con una
 * comparación de cadena y no recorriendo una jerarquía.
 */
export const PERMISOS = [
  // Estructura base
  ['facultad.leer', 'Consultar facultades', 'plan-estudios'],
  ['facultad.crear', 'Registrar una facultad', 'plan-estudios'],
  ['facultad.editar', 'Editar una facultad', 'plan-estudios'],
  ['facultad.inactivar', 'Inactivar una facultad', 'plan-estudios'],

  ['carrera.leer', 'Consultar carreras', 'plan-estudios'],
  ['carrera.crear', 'Registrar una carrera', 'plan-estudios'],
  ['carrera.editar', 'Editar una carrera', 'plan-estudios'],
  ['carrera.inactivar', 'Inactivar una carrera', 'plan-estudios'],

  // Plan de estudios
  // `plan.acceder` decide solo si el usuario entra a las pantallas del módulo
  // Plan de Estudios; `plan.leer` decide si puede leer los datos. Van separados
  // porque el Coordinador lee planes, objetivos y competencias desde Mejora
  // Continua sin tener el módulo Plan de Estudios.
  ['plan.acceder', 'Entrar al módulo Plan de Estudios', 'plan-estudios'],
  ['plan.leer', 'Consultar planes de estudio', 'plan-estudios'],
  ['plan.leer_historico', 'Consultar versiones históricas', 'plan-estudios'],
  ['plan.crear', 'Crear un plan de estudios', 'plan-estudios'],
  ['plan.editar', 'Editar un plan en Borrador o En revisión', 'plan-estudios'],
  ['plan.eliminar', 'Eliminar un plan en Borrador', 'plan-estudios'],
  ['plan.enviar_revision', 'Enviar un plan a revisión', 'plan-estudios'],
  ['plan.aprobar', 'Aprobar un plan de estudios', 'plan-estudios'],
  ['plan.observar', 'Devolver un plan con observaciones', 'plan-estudios'],
  ['plan.nueva_version', 'Generar una nueva versión del plan', 'plan-estudios'],
  ['plan.justificar', 'Justificar una observación no bloqueante', 'plan-estudios'],

  // Contenido curricular
  ['objetivo.leer', 'Consultar objetivos educacionales', 'plan-estudios'],
  ['objetivo.gestionar', 'Crear, editar e inactivar objetivos', 'plan-estudios'],
  ['competencia.leer', 'Consultar competencias', 'plan-estudios'],
  ['competencia.gestionar', 'Crear, editar e inactivar competencias', 'plan-estudios'],
  ['atributo.leer', 'Consultar atributos del graduado', 'acreditacion'],
  [
    'atributo.gestionar',
    'Crear, editar, inactivar y eliminar atributos del graduado',
    'acreditacion',
  ],
  // Como `plan.acceder`: decide solo si se entra a la sección; `criterio.leer`
  // decide si se pueden leer los datos (el Docente los lee desde Planes de
  // Mejora sin tener la sección).
  ['criterio.acceder', 'Entrar a la sección Criterios de Acreditación', 'acreditacion'],
  ['criterio.leer', 'Consultar criterios de acreditación', 'acreditacion'],
  [
    'criterio.gestionar',
    'Crear, editar, inactivar y eliminar criterios de acreditación',
    'acreditacion',
  ],
  ['asignatura.leer', 'Consultar asignaturas', 'plan-estudios'],
  ['asignatura.gestionar', 'Crear, editar e inactivar asignaturas', 'plan-estudios'],
  ['malla.editar', 'Ubicar asignaturas en los ciclos', 'plan-estudios'],

  // Mejora continua — Planes de Medición
  ['medicion.leer', 'Consultar planes de medición', 'mejora-continua'],
  ['medicion.crear', 'Crear un plan de medición', 'mejora-continua'],
  ['medicion.editar', 'Editar un plan de medición en Borrador', 'mejora-continua'],
  ['medicion.eliminar', 'Eliminar un plan de medición en Borrador', 'mejora-continua'],
  ['medicion.aprobar', 'Aprobar, observar y dar vigencia a un plan de medición', 'mejora-continua'],

  // Mejora continua — Planes de Evaluación
  // Mismo criterio: el Docente lee planes de evaluación desde «Mis evidencias»
  // sin tener el submódulo Planes de Evaluación.
  ['evaluacion.acceder', 'Entrar al submódulo Planes de Evaluación', 'mejora-continua'],
  ['evaluacion.leer', 'Consultar planes de evaluación', 'mejora-continua'],
  ['evaluacion.crear', 'Crear un plan de evaluación', 'mejora-continua'],
  ['evaluacion.editar', 'Editar un plan de evaluación en Borrador', 'mejora-continua'],
  ['evaluacion.eliminar', 'Eliminar un plan de evaluación en Borrador', 'mejora-continua'],
  [
    'evaluacion.aprobar',
    'Aprobar, observar y dar vigencia a un plan de evaluación',
    'mejora-continua',
  ],
  [
    'evidencia.registrar',
    'Registrar evidencias de las evaluaciones que tiene asignadas',
    'mejora-continua',
  ],

  // Mejora continua — Planes de Mejora
  ['mejora.leer', 'Consultar planes de mejora', 'mejora-continua'],
  ['mejora.crear', 'Crear un plan de mejora', 'mejora-continua'],
  ['mejora.editar', 'Editar un plan de mejora en Borrador', 'mejora-continua'],
  ['mejora.eliminar', 'Eliminar un plan de mejora en Borrador', 'mejora-continua'],
  ['mejora.aprobar', 'Aprobar, observar y dar vigencia a un plan de mejora', 'mejora-continua'],

  // Mejora continua — Actas de Aprobación
  ['actas.leer', 'Consultar actas de aprobación', 'mejora-continua'],
  ['actas.crear', 'Crear un acta de aprobación', 'mejora-continua'],
  ['actas.editar', 'Editar un acta de aprobación en Borrador', 'mejora-continua'],
  ['actas.eliminar', 'Eliminar un acta de aprobación en Borrador', 'mejora-continua'],
  ['actas.aprobar', 'Aprobar, rechazar u observar un acta de aprobación', 'mejora-continua'],

  // Transversales
  ['reporte.generar', 'Generar PDF y Excel del plan', 'plan-estudios'],
  ['auditoria.leer', 'Consultar el histórico de cambios', 'auditoria'],
  ['auditoria.leer_entidad', 'Consultar el historial de una entidad concreta', 'auditoria'],
  ['usuario.gestionar', 'Administrar usuarios y sus roles', 'auth'],
  ['rol.gestionar', 'Administrar roles y permisos', 'auth'],
  ['docente.gestionar', 'Gestionar los docentes de su carrera', 'auth'],
  ['lectura.solo_su_carrera', 'Leer solo los datos de la carrera que tiene a cargo', 'auth'],
] as const satisfies readonly (readonly [string, string, string])[];

/* ── Roles ────────────────────────────────────────────────────────────────
 * Los cinco definidos por la universidad. La descripción es la textual, para
 * que el permiso concedido se pueda contrastar con la intención declarada.
 */
export const ROLES: {
  codigo: string;
  nombre: string;
  descripcion: string;
  permisos: readonly string[];
}[] = [
  {
    codigo: 'ADMIN_SISTEMA',
    nombre: 'Administrador del sistema',
    descripcion: 'Gestión de la estructura base (facultades, carreras).',
    // Dueño de la estructura y de las cuentas. Desde el Bloque 3 (RF-CH-008) ve
    // el módulo Plan de Estudios como «Facultades» y solo hasta las carreras:
    // no lee planes ni su contenido (objetivos, competencias, asignaturas). Antes
    // sí los leía, para no abrir un plan a medias; el documento de cambios
    // decide que no le corresponden.
    //
    // Conserva `plan.acceder` para entrar al módulo. Lo que sigue fuera, a
    // propósito: no crea ni edita contenido, no aprueba planes y no tiene
    // `reporte.generar`.
    permisos: [
      'facultad.leer',
      'facultad.crear',
      'facultad.editar',
      'facultad.inactivar',
      'carrera.leer',
      'carrera.crear',
      'carrera.editar',
      'carrera.inactivar',
      'plan.acceder',
      'auditoria.leer',
      'usuario.gestionar',
      'rol.gestionar',
    ],
  },
  {
    codigo: 'DIRECTOR_CARRERA',
    nombre: 'Director de carrera',
    descripcion: 'Gestión y aprobación del plan de estudios de su carrera.',
    // Único rol con `plan.aprobar`. RF086 RN1 pide permiso explícito de
    // aprobación, y la definición del rol lo limita a "su carrera": ese alcance
    // lo aporta la tabla `usuario_carrera`, no este listado.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.acceder',
      'plan.leer',
      'plan.leer_historico',
      'plan.crear',
      'plan.editar',
      'plan.eliminar',
      'plan.enviar_revision',
      'plan.aprobar',
      'plan.observar',
      'plan.nueva_version',
      'plan.justificar',
      'objetivo.leer',
      'objetivo.gestionar',
      'competencia.leer',
      'competencia.gestionar',
      'asignatura.leer',
      'asignatura.gestionar',
      'malla.editar',
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
      'actas.aprobar',
      'reporte.generar',
      'auditoria.leer',
      'docente.gestionar',
      'lectura.solo_su_carrera',
    ],
  },
  {
    codigo: 'COORDINADOR_ACADEMICO',
    nombre: 'Coordinador académico',
    descripcion: 'Apoyo en la gestión operativa del plan de estudios.',
    // Arma los planes de Mejora Continua y los aprueba: decisión de la
    // universidad tomada al revisar el Bloque 1 (2026-09-29). No aprueba el
    // plan de estudios, que sigue siendo del Director.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      // Lecturas que las pantallas de Mejora Continua hacen sobre Plan de
      // Estudios (elegir plan, objetivos y competencias). Sin `plan.acceder`:
      // leen los datos, no entran al módulo.
      'plan.leer',
      'objetivo.leer',
      'competencia.leer',
      // RF120 y RF129 listan al Coordinador junto al Director como actor de
      // registro y edición; lo que no tiene, aquí como en el plan, es aprobar.
      'atributo.leer',
      'atributo.gestionar',
      'criterio.leer',
      'criterio.acceder',
      'criterio.gestionar',
      'medicion.leer',
      'medicion.crear',
      'medicion.editar',
      'medicion.eliminar',
      'medicion.aprobar',
      'evaluacion.leer',
      'evaluacion.acceder',
      'evaluacion.crear',
      'evaluacion.editar',
      'evaluacion.eliminar',
      'evaluacion.aprobar',
      'mejora.leer',
      'mejora.crear',
      'mejora.editar',
      'mejora.eliminar',
      'mejora.aprobar',
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
      // Solo el historial de una entidad concreta, no la bitácora entera: quien
      // edita un plan tiene que poder ver qué se hizo sobre él (RF-PM-032), y
      // eso no exige darle acceso a los accesos de todos ni a los demás módulos.
      'auditoria.leer_entidad',
      'reporte.generar',
      // Bloque 6a (RF-CH-034, RF-CH-038): ve solo los planes de su carrera, y la
      // URL directa a los de otra se deniega. La marca acota TODAS sus lecturas,
      // no solo las de Mejora Continua: carreras, planes de estudio, catálogo,
      // cobertura, panel de reportes y Acreditación.
      'lectura.solo_su_carrera',
    ],
  },
  {
    codigo: 'DOCENTE',
    nombre: 'Docente',
    descripcion: 'Trabaja sobre los planes de mejora de su carrera y registra sus evidencias.',
    // RF-CH-006 RN4: Planes de Mejora, «Mis evidencias» y su inicio. Nada más
    // abre un módulo. Lo que sí conserva son las lecturas de datos que esas
    // pantallas consumen (verificado endpoint por endpoint en el Bloque 2):
    // `evaluacion.leer` y `criterio.leer` no abren Planes de Evaluación ni
    // Criterios, porque eso lo deciden `evaluacion.acceder` y `criterio.acceder`.
    permisos: [
      'carrera.leer',
      'objetivo.leer',
      'competencia.leer',
      'criterio.leer',
      'evaluacion.leer',
      'evidencia.registrar',
      'mejora.leer',
    ],
  },
  {
    codigo: 'USUARIO_CONSULTOR',
    nombre: 'Usuario consultor',
    descripcion: 'Consulta de planes de estudio vigentes.',
    // El más restringido: solo planes vigentes. Sin `plan.leer_historico`,
    // porque su definición dice "vigentes" y no "todos".
    // RF122 y RF131 lo nombran entre quienes visualizan atributos y criterios:
    // ambos listados llevan indicador de estado y son solo de lectura.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.acceder',
      'plan.leer',
      'atributo.leer',
      'criterio.leer',
      'criterio.acceder',
      'medicion.leer',
      'evaluacion.leer',
      'evaluacion.acceder',
      'mejora.leer',
      'actas.leer',
    ],
  },
];
