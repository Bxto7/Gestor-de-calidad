/**
 * Plan de estudios 201910 — Ingeniería de Sistemas e Informática (2018).
 *
 * Transcrito del plan publicado por la Universidad Continental. Es información
 * institucional del currículo: **no** incluye estado de avance, notas ni veces
 * llevada de ningún estudiante. Esos datos son personales y §6.5 los deja fuera
 * de cualquier entorno que no sea producción.
 *
 * La transcripción se verificó por aritmética: los créditos obligatorios suman
 * 201, que es exactamente el total que declara el plan oficial. Un error al
 * copiar una fila lo habría delatado.
 */

export interface AsignaturaFuente {
  readonly codigo: string;
  readonly nombre: string;
  readonly creditos: number;
  readonly ciclo: number;
  readonly electiva?: boolean;
  /** Códigos de asignatura que hay que aprobar antes. */
  readonly prerrequisitos?: readonly string[];
  /**
   * Requisitos que el modelo no sabe expresar: "140 créditos aprobados",
   * "certificado de inglés B1". Se conservan aquí para no perderlos y para
   * poder medir cuántos son.
   */
  readonly requisitoNoModelable?: string;
  /** Grupo de electivos al que pertenece, cuando lo hay. */
  readonly grupoElectivo?: 'ELEC GENER' | 'ELECT ESP1' | 'ELECT ESP2';
}

export const COMPETENCIAS: readonly { codigo: string; nombre: string; atributoIcacit: string }[] = [
  { codigo: 'CPE-ISI01', nombre: 'Aprendizaje autónomo', atributoIcacit: 'AG-I06' },
  {
    codigo: 'CPE-ISI02',
    nombre: 'Aprendizaje experiencial y colaborativo',
    atributoIcacit: 'AG-I03',
  },
  { codigo: 'CPE-ISI03', nombre: 'Ciudadanía glocal', atributoIcacit: 'AG-I02' },
  { codigo: 'CPE-ISI04', nombre: 'Comunicación efectiva', atributoIcacit: 'AG-I04' },
  { codigo: 'CPE-ISI05', nombre: 'Gestión de TIC', atributoIcacit: 'AG-I06' },
  { codigo: 'CPE-ISI06', nombre: 'Mentalidad emprendedora', atributoIcacit: 'AG-I05' },
  { codigo: 'CPE-ISI07', nombre: 'Conocimientos de ingeniería', atributoIcacit: 'AG-I07' },
  { codigo: 'CPE-ISI08', nombre: 'Experimentación', atributoIcacit: 'AG-I10' },
  { codigo: 'CPE-ISI09', nombre: 'Medioambiente y sostenibilidad', atributoIcacit: 'AG-I01' },
  { codigo: 'CPE-ISI10', nombre: 'El ingeniero y la sociedad', atributoIcacit: 'AG-I01' },
  { codigo: 'CPE-ISI11', nombre: 'Gestión de proyectos', atributoIcacit: 'AG-I05' },
  { codigo: 'CPE-ISI12', nombre: 'Diseño y desarrollo de soluciones', atributoIcacit: 'AG-I09' },
  { codigo: 'CPE-ISI13', nombre: 'Análisis de problemas', atributoIcacit: 'AG-I08' },
  { codigo: 'CPE-ISI14', nombre: 'Uso de herramientas modernas', atributoIcacit: 'AG-I11' },
];

export const OBJETIVOS: readonly { codigo: string; nombre: string; descripcion: string }[] = [
  {
    codigo: 'OE-01',
    nombre: 'Capacidad profesional',
    descripcion:
      'Liderarán o participarán como miembros del equipo en proyectos de ingeniería de ' +
      'software de diferente tamaño y complejidad, en proyectos de optimización o innovación ' +
      'de procesos organizacionales, como emprendedor o intraemprendedor, empleando ' +
      'metodologías y prácticas de calidad.',
  },
  {
    codigo: 'OE-02',
    nombre: 'Capacidad de adaptación a los cambios y formación continua',
    descripcion:
      'Actualizarán sus conocimientos en nuevas tecnologías, modelos, técnicas o herramientas ' +
      'a través de certificaciones internacionales, diplomados o estudios de posgrado, con el ' +
      'objetivo de mejorar su desarrollo personal y profesional.',
  },
  {
    codigo: 'OE-03',
    nombre: 'Responsabilidad profesional',
    descripcion:
      'Desempeñarán sus funciones como líder o miembro del equipo, demostrando la capacidad ' +
      'de trabajar con eficacia, manteniendo buenas relaciones interpersonales y valores éticos.',
  },
];

export const ASIGNATURAS: readonly AsignaturaFuente[] = [
  /* ── 1.º período ─────────────────────────────────────────────────── */
  { codigo: 'ASUC01113', nombre: 'Matemática Superior', creditos: 5, ciclo: 1 },
  { codigo: 'ASUC01083', nombre: 'Habilidades Comunicativas', creditos: 4, ciclo: 1 },
  { codigo: 'ASUC01082', nombre: 'Gestión del Aprendizaje', creditos: 3, ciclo: 1 },
  {
    codigo: 'ASUC00512',
    nombre: 'Introducción a la Ingeniería de Sistemas e Informática',
    creditos: 3,
    ciclo: 1,
  },
  { codigo: 'ASUC01117', nombre: 'Química 1', creditos: 3, ciclo: 1 },
  { codigo: 'ASUC01086', nombre: 'Laboratorio de Liderazgo', creditos: 2, ciclo: 1 },
  {
    codigo: 'ASUC01700',
    nombre: 'Herramientas Virtuales para el Aprendizaje',
    creditos: 1,
    ciclo: 1,
  },

  /* ── 2.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01108',
    nombre: 'Álgebra Matricial y Geometría Analítica',
    creditos: 4,
    ciclo: 2,
    prerrequisitos: ['ASUC01113'],
  },
  {
    codigo: 'ASUC01110',
    nombre: 'Fundamentos del Cálculo',
    creditos: 4,
    ciclo: 2,
    prerrequisitos: ['ASUC01113'],
  },
  {
    codigo: 'ASUC00562',
    nombre: 'Matemática Discreta',
    creditos: 4,
    ciclo: 2,
    requisitoNoModelable: '20 créditos aprobados',
  },
  {
    codigo: 'ASUC01075',
    nombre: 'Comunicación Efectiva',
    creditos: 3,
    ciclo: 2,
    prerrequisitos: ['ASUC01083'],
  },
  { codigo: 'ASUC01079', nombre: 'Ética, Ciudadanía y Globalización', creditos: 3, ciclo: 2 },
  { codigo: 'ASUC01112', nombre: 'Gestión Basada en Procesos', creditos: 3, ciclo: 2 },

  /* ── 3.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01160',
    nombre: 'Cálculo Diferencial',
    creditos: 5,
    ciclo: 3,
    prerrequisitos: ['ASUC01108'],
  },
  { codigo: 'ASUC01296', nombre: 'Física 1', creditos: 4, ciclo: 3, prerrequisitos: ['ASUC01110'] },
  {
    codigo: 'ASUC01312',
    nombre: 'Fundamentos de Programación',
    creditos: 4,
    ciclo: 3,
    requisitoNoModelable: '30 créditos aprobados',
  },
  {
    codigo: 'ASUC00798',
    nombre: 'Sistemas de Información',
    creditos: 4,
    ciclo: 3,
    prerrequisitos: ['ASUC01112'],
  },
  {
    codigo: 'ASUC01275',
    nombre: 'Estadística General',
    creditos: 3,
    ciclo: 3,
    prerrequisitos: ['ASUC01110'],
  },
  {
    codigo: 'ASUC01389',
    nombre: 'Laboratorio de Innovación',
    creditos: 1,
    ciclo: 3,
    prerrequisitos: ['ASUC01086'],
  },

  /* ── 4.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01161',
    nombre: 'Cálculo Integral',
    creditos: 5,
    ciclo: 4,
    prerrequisitos: ['ASUC01160'],
  },
  { codigo: 'ASUC01297', nombre: 'Física 2', creditos: 4, ciclo: 4, prerrequisitos: ['ASUC01296'] },
  {
    codigo: 'ASUC01482',
    nombre: 'Programación Orientada a Objetos',
    creditos: 4,
    ciclo: 4,
    prerrequisitos: ['ASUC01312'],
  },
  {
    codigo: 'ASUC01183',
    nombre: 'Comunicación y Argumentación',
    creditos: 3,
    ciclo: 4,
    prerrequisitos: ['ASUC01075'],
  },
  {
    codigo: 'ASUC01273',
    nombre: 'Estadística Aplicada',
    creditos: 3,
    ciclo: 4,
    prerrequisitos: ['ASUC01275'],
  },
  {
    codigo: 'ASUC00316',
    nombre: 'Estructura de Datos',
    creditos: 3,
    ciclo: 4,
    prerrequisitos: ['ASUC01312'],
  },

  /* ── 5.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01255',
    nombre: 'Ecuaciones Diferenciales',
    creditos: 5,
    ciclo: 5,
    prerrequisitos: ['ASUC01161'],
  },
  {
    codigo: 'ASUC01136',
    nombre: 'Análisis y Requerimientos de Software',
    creditos: 4,
    ciclo: 5,
    prerrequisitos: ['ASUC00798'],
  },
  {
    codigo: 'ASUC00051',
    nombre: 'Base de Datos',
    creditos: 4,
    ciclo: 5,
    prerrequisitos: ['ASUC00316'],
  },
  {
    codigo: 'ASUC01541',
    nombre: 'Sistemas Digitales',
    creditos: 4,
    ciclo: 5,
    requisitoNoModelable: '60 créditos aprobados',
  },
  {
    codigo: 'ASUC01388',
    nombre: 'Laboratorio Avanzado de Innovación y Liderazgo',
    creditos: 1,
    ciclo: 5,
    prerrequisitos: ['ASUC01389'],
  },

  /* ── 6.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01140',
    nombre: 'Arquitectura del Computador',
    creditos: 4,
    ciclo: 6,
    prerrequisitos: ['ASUC01541'],
  },
  {
    codigo: 'ASUC00957',
    nombre: 'Diseño de Software',
    creditos: 4,
    ciclo: 6,
    prerrequisitos: ['ASUC01136'],
  },
  {
    codigo: 'ASUC01386',
    nombre: 'Investigación Operativa',
    creditos: 4,
    ciclo: 6,
    prerrequisitos: ['ASUC01273'],
  },
  {
    codigo: 'ASUC00006',
    nombre: 'Administración de Base de Datos',
    creditos: 3,
    ciclo: 6,
    prerrequisitos: ['ASUC00051'],
  },
  {
    codigo: 'ASUC01532',
    nombre: 'Seminario de Investigación',
    creditos: 3,
    ciclo: 6,
    requisitoNoModelable: '80 créditos aprobados',
  },
  {
    codigo: 'ASUC01061',
    nombre: 'Sistemas Operativos',
    creditos: 3,
    ciclo: 6,
    requisitoNoModelable: '80 créditos aprobados',
  },

  /* ── 7.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01141',
    nombre: 'Arquitectura Empresarial',
    creditos: 5,
    ciclo: 7,
    prerrequisitos: ['ASUC00051'],
  },
  {
    codigo: 'ASUC00947',
    nombre: 'Construcción de Software',
    creditos: 5,
    ciclo: 7,
    prerrequisitos: ['ASUC00957', 'ASUC01482'],
  },
  {
    codigo: 'ASUC00754',
    nombre: 'Redes de Computadores',
    creditos: 4,
    ciclo: 7,
    prerrequisitos: ['ASUC01140'],
  },
  {
    codigo: 'ASUC00466',
    nombre: 'Ingeniería Económica',
    creditos: 3,
    ciclo: 7,
    requisitoNoModelable: '100 créditos aprobados',
  },
  {
    codigo: 'ASUC01365',
    nombre: 'Innovación Social',
    creditos: 2,
    ciclo: 7,
    prerrequisitos: ['ASUC01388'],
  },
  {
    codigo: 'ASUC01341',
    nombre: 'Gestión Profesional',
    creditos: 1,
    ciclo: 7,
    requisitoNoModelable: '100 créditos aprobados',
  },

  /* ── 8.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC00123',
    nombre: 'Conmutación y Enrutamiento',
    creditos: 4,
    ciclo: 8,
    prerrequisitos: ['ASUC00754'],
  },
  {
    codigo: 'ASUC01235',
    nombre: 'Dirección de Proyectos',
    creditos: 4,
    ciclo: 8,
    requisitoNoModelable: '120 créditos aprobados',
  },
  {
    codigo: 'ASUC01006',
    nombre: 'Pruebas y Calidad de Software',
    creditos: 4,
    ciclo: 8,
    prerrequisitos: ['ASUC00947'],
  },
  {
    codigo: 'ASUC01534',
    nombre: 'Simulación',
    creditos: 4,
    ciclo: 8,
    requisitoNoModelable: '120 créditos aprobados',
  },
  {
    codigo: 'ASUC01203',
    nombre: 'Conversation Class',
    creditos: 3,
    ciclo: 8,
    requisitoNoModelable: 'Certificado de dominio de inglés (B1)',
  },
  {
    codigo: 'ASUC01545',
    nombre: 'Supervisión Prácticas Preprofesionales - Ingeniería',
    creditos: 1,
    ciclo: 8,
    prerrequisitos: ['ASUC01341'],
  },

  /* ── 9.º período ─────────────────────────────────────────────────── */
  {
    codigo: 'ASUC01228',
    nombre: 'Desarrollo de Aplicaciones Móviles',
    creditos: 4,
    ciclo: 9,
    requisitoNoModelable: '140 créditos aprobados',
  },
  {
    codigo: 'ASUC00469',
    nombre: 'Ingeniería Web',
    creditos: 4,
    ciclo: 9,
    requisitoNoModelable: '140 créditos aprobados',
  },
  {
    codigo: 'ASUC01580',
    nombre: 'Taller de Investigación 1 - Ingeniería de Sistemas e Informática',
    creditos: 4,
    ciclo: 9,
    prerrequisitos: ['ASUC01532'],
    requisitoNoModelable: '140 créditos aprobados',
  },
  {
    codigo: 'ASUC01584',
    nombre: 'Taller de Proyectos 1 - Ingeniería de Sistemas e Informática',
    creditos: 4,
    ciclo: 9,
    prerrequisitos: ['ASUC01006', 'ASUC01235'],
  },
  {
    codigo: 'ASUC00413',
    nombre: 'Gestión de Servicios TI',
    creditos: 3,
    ciclo: 9,
    requisitoNoModelable: '140 créditos aprobados',
  },

  /* ── 10.º período ────────────────────────────────────────────────── */
  {
    codigo: 'ASUC00941',
    nombre: 'Auditoría de Sistemas',
    creditos: 4,
    ciclo: 10,
    requisitoNoModelable: '160 créditos aprobados',
  },
  {
    codigo: 'ASUC01581',
    nombre: 'Taller de Investigación 2 - Ingeniería de Sistemas e Informática',
    creditos: 4,
    ciclo: 10,
    prerrequisitos: ['ASUC01580'],
  },
  {
    codigo: 'ASUC01585',
    nombre: 'Taller de Proyectos 2 - Ingeniería de Sistemas e Informática',
    creditos: 4,
    ciclo: 10,
    prerrequisitos: ['ASUC01584'],
  },
  {
    codigo: 'ASUC00097',
    nombre: 'Cloud Computing',
    creditos: 3,
    ciclo: 10,
    prerrequisitos: ['ASUC00469'],
  },
  {
    codigo: 'ASUC00490',
    nombre: 'Inteligencia de Negocios',
    creditos: 3,
    ciclo: 10,
    prerrequisitos: ['ASUC00006'],
  },

  /* ── Electivos generales (ciclo 5) ───────────────────────────────── */
  {
    codigo: 'ASUC01353',
    nombre: 'Historia Social Contemporánea',
    creditos: 3,
    ciclo: 5,
    electiva: true,
    grupoElectivo: 'ELEC GENER',
  },
  {
    codigo: 'ASUC01511',
    nombre: 'Realidad Nacional y Regional',
    creditos: 3,
    ciclo: 5,
    electiva: true,
    grupoElectivo: 'ELEC GENER',
  },
  {
    codigo: 'ASUC01635',
    nombre: 'Discapacidad e Inclusión',
    creditos: 3,
    ciclo: 5,
    electiva: true,
    grupoElectivo: 'ELEC GENER',
  },
  {
    codigo: 'ASUC01658',
    nombre: 'Medio Ambiente y Ecología',
    creditos: 3,
    ciclo: 5,
    electiva: true,
    grupoElectivo: 'ELEC GENER',
    prerrequisitos: ['ASUC01079'],
  },
  {
    codigo: 'ASUC01703',
    nombre: 'Deporte, Sociedad y Género',
    creditos: 3,
    ciclo: 5,
    electiva: true,
    grupoElectivo: 'ELEC GENER',
  },

  /* ── Electivos de especialidad 1 (ciclo 9) ───────────────────────── */
  {
    codigo: 'ASUC00304',
    nombre: 'Escalamiento de Redes de Computadoras',
    creditos: 3,
    ciclo: 9,
    electiva: true,
    grupoElectivo: 'ELECT ESP1',
    requisitoNoModelable: '140 créditos aprobados',
  },
  {
    codigo: 'ASUC00587',
    nombre: 'Metodologías Ágiles de Desarrollo de Software',
    creditos: 3,
    ciclo: 9,
    electiva: true,
    grupoElectivo: 'ELECT ESP1',
  },
  {
    codigo: 'ASUC00769',
    nombre: 'Seguridad de la Información Corporativa',
    creditos: 3,
    ciclo: 9,
    electiva: true,
    grupoElectivo: 'ELECT ESP1',
  },
  {
    codigo: 'ASUC00802',
    nombre: 'Sistemas de Información Integrados',
    creditos: 3,
    ciclo: 9,
    electiva: true,
    grupoElectivo: 'ELECT ESP1',
  },
  {
    codigo: 'ASUC01702',
    nombre: 'Procesos de Software',
    creditos: 3,
    ciclo: 9,
    electiva: true,
    grupoElectivo: 'ELECT ESP1',
  },

  /* ── Electivos de especialidad 2 (ciclo 10) ──────────────────────── */
  {
    codigo: 'ASUC00210',
    nombre: 'Desarrollo de Videojuegos',
    creditos: 3,
    ciclo: 10,
    electiva: true,
    grupoElectivo: 'ELECT ESP2',
  },
  {
    codigo: 'ASUC00381',
    nombre: 'Gerencia de la Seguridad de Información',
    creditos: 3,
    ciclo: 10,
    electiva: true,
    grupoElectivo: 'ELECT ESP2',
  },
  {
    codigo: 'ASUC00614',
    nombre: 'Negocios Electrónicos',
    creditos: 3,
    ciclo: 10,
    electiva: true,
    grupoElectivo: 'ELECT ESP2',
  },
  {
    codigo: 'ASUC00662',
    nombre: 'Planeamiento Estratégico de los SI/TI',
    creditos: 3,
    ciclo: 10,
    electiva: true,
    grupoElectivo: 'ELECT ESP2',
  },
  {
    codigo: 'ASUC00756',
    nombre: 'Redes WAN',
    creditos: 3,
    ciclo: 10,
    electiva: true,
    grupoElectivo: 'ELECT ESP2',
  },
  {
    codigo: 'ASUC00940',
    nombre: 'Arquitectura Orientada a Servicios',
    creditos: 3,
    ciclo: 10,
    electiva: true,
    grupoElectivo: 'ELECT ESP2',
  },
];

/**
 * Competencias vinculadas, por asignatura.
 *
 * Solo cinco cursos las tienen cargadas: son los que la carrera declara como
 * portadores de competencia en su matriz. Entre los cinco cubren las catorce,
 * y `Análisis de problemas` la comparten dos, que es como está en el original.
 * Del resto de asignaturas todavía no se tiene el dato, y dejarlo vacío es más
 * honesto que repartirlo a ojo.
 */
export const COMPETENCIAS_POR_ASIGNATURA: Readonly<Record<string, readonly string[]>> = {
  // Taller de Proyectos 1
  ASUC01584: ['CPE-ISI07', 'CPE-ISI10', 'CPE-ISI11', 'CPE-ISI13', 'CPE-ISI14'],
  // Taller de Proyectos 2
  ASUC01585: ['CPE-ISI02', 'CPE-ISI03', 'CPE-ISI04', 'CPE-ISI06', 'CPE-ISI09', 'CPE-ISI12'],
  // Taller de Investigación 1
  ASUC01580: ['CPE-ISI05', 'CPE-ISI13'],
  // Taller de Investigación 2
  ASUC01581: ['CPE-ISI01'],
  // Pruebas y Calidad de Software
  ASUC01006: ['CPE-ISI08'],
};
