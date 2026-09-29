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
  ['atributo.leer', 'Consultar atributos del graduado', 'plan-estudios'],
  ['atributo.gestionar', 'Crear, editar e inactivar atributos del graduado', 'plan-estudios'],
  ['criterio.leer', 'Consultar criterios de acreditación', 'plan-estudios'],
  ['criterio.gestionar', 'Crear, editar e inactivar criterios de acreditación', 'plan-estudios'],
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
    // Dueño de la estructura y de las cuentas. **Lee todo, no decide nada
    // académico**: esa separación es la que define el rol.
    //
    // Los tres `.leer` de contenido curricular estaban fuera y se añadieron
    // después de comprobar el resultado: con `plan.leer` pero sin
    // `asignatura.leer`, el administrador abría un plan y encontraba la mitad
    // vacía —sin créditos, sin malla, sin validaciones— sobre un plan que sí
    // existe. Puede administrar cuentas y estructura de una universidad cuyo
    // contenido no podía consultar.
    //
    // Lo que sigue fuera, y a propósito: no crea ni edita contenido, no aprueba
    // planes y **no tiene `reporte.generar`**. Ese permiso no es de lectura:
    // produce evidencia documental que sale de la universidad hacia un
    // expediente de acreditación, y eso es una responsabilidad académica.
    permisos: [
      'facultad.leer',
      'facultad.crear',
      'facultad.editar',
      'facultad.inactivar',
      'carrera.leer',
      'carrera.crear',
      'carrera.editar',
      'carrera.inactivar',
      'plan.leer',
      'plan.leer_historico',
      'objetivo.leer',
      'competencia.leer',
      'asignatura.leer',
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
    ],
  },
  {
    codigo: 'COORDINADOR_ACADEMICO',
    nombre: 'Coordinador académico',
    descripcion: 'Apoyo en la gestión operativa del plan de estudios.',
    // Arma el plan y lo envía a revisión, pero NO lo aprueba ni lo observa:
    // quien construye no puede ser quien da el visto bueno. Esa separación es
    // lo que hace que la aprobación signifique algo en una auditoría.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      // RF120 y RF129 listan al Coordinador junto al Director como actor de
      // registro y edición; lo que no tiene, aquí como en el plan, es aprobar.
      'atributo.leer',
      'atributo.gestionar',
      'criterio.leer',
      'criterio.gestionar',
      // Configura y envía a revisión, pero no aprueba: la misma separación que
      // ya lo deja fuera de `plan.aprobar`. Quien construye no da el visto bueno.
      'medicion.leer',
      'medicion.crear',
      'medicion.editar',
      'medicion.eliminar',
      // Igual que en medición y por la misma razón (RF-PE-046): sin
      // `evaluacion.aprobar`.
      'evaluacion.leer',
      'evaluacion.crear',
      'evaluacion.editar',
      'evaluacion.eliminar',
      // Misma separación otra vez (RF-PJ-044): arma y edita, no aprueba.
      'mejora.leer',
      'mejora.crear',
      'mejora.editar',
      'mejora.eliminar',
      'actas.leer',
      'actas.crear',
      'actas.editar',
      'actas.eliminar',
      // Solo el historial de una entidad concreta, no la bitácora entera: quien
      // edita un plan tiene que poder ver qué se hizo sobre él (RF-PM-032), y
      // eso no exige darle acceso a los accesos de todos ni a los demás módulos.
      'auditoria.leer_entidad',
      'reporte.generar',
    ],
  },
  {
    codigo: 'DOCENTE',
    nombre: 'Docente',
    descripcion: 'Consulta de la información curricular relacionada a su labor.',
    // Solo lectura, pero con acceso al detalle curricular: necesita ver las
    // competencias de las asignaturas que dicta.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.leer',
      'objetivo.leer',
      'competencia.leer',
      // RF122 y RF131 incluyen al consultor entre quienes visualizan; el docente
      // ya ve el detalle curricular, y el atributo es parte de él.
      'atributo.leer',
      'criterio.leer',
      'asignatura.leer',
      // Ve en qué periodos se mide la competencia de la asignatura que dicta.
      'medicion.leer',
      'evaluacion.leer',
      // Registra las evidencias de las evaluaciones que le asignaron (spec de
      // evidencias del docente): escritura acotada a su carrera.
      'evidencia.registrar',
      'mejora.leer',
      'actas.leer',
      'reporte.generar',
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
      'plan.leer',
      'atributo.leer',
      'criterio.leer',
      'medicion.leer',
      'evaluacion.leer',
      'mejora.leer',
      'actas.leer',
    ],
  },
];
