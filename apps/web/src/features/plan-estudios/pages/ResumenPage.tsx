/**
 * 3.1 Inicio / Resumen — shell de navegación, sin RF asociados.
 *
 * Además de listar los módulos, la pantalla se mide contra los ocho criterios
 * de acreditación de ICACIT. Es la pregunta que una acreditación hace de
 * verdad —«¿qué criterio queda sin cubrir?»— y responderla aquí evita que haya
 * que reconstruirla a mano cada vez que alguien la formula.
 *
 * El estado de cada criterio se mantiene a mano, y a propósito: derivarlo del
 * código exigiría una trazabilidad que hoy no existe, y una cifra inventada
 * sería peor que una escrita y revisable.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { Badge } from '@/shared/components/ui';

interface Modulo {
  readonly titulo: string;
  readonly detalle: string;
  readonly a: string;
}

/** Lo que hoy se puede abrir y usar. */
const ACTIVOS: readonly Modulo[] = [
  {
    titulo: 'Plan de Estudios',
    detalle:
      'Facultades, carreras, objetivos educacionales, competencias, atributos del graduado, asignaturas y malla curricular. Incluye el flujo de aprobación y el versionado del plan.',
    a: '/plan-estudios',
  },
  {
    titulo: 'Mejora Continua',
    detalle:
      'Planes de medición de competencias: meta, competencias por atributo del graduado, periodos y la matriz de programación con su seguimiento.',
    a: '/mejora-continua/medicion',
  },
  {
    titulo: 'Atributos del Graduado',
    detalle:
      'El perfil contra el que se acredita el programa. Catálogo del marco de acreditación, con el recuento de qué competencias desarrollan cada atributo.',
    a: '/acreditacion/atributos',
  },
];

type EstadoCriterio = 'cubierto' | 'parcial' | 'pendiente';

interface Criterio {
  readonly numero: number;
  readonly nombre: string;
  readonly estado: EstadoCriterio;
  readonly nota: string;
}

/**
 * Los ocho criterios del modelo ICACIT, con lo que el sistema cubre de cada uno.
 *
 * «Parcial» no es un eufemismo: Mejora Continua tiene construido el primero de
 * sus cuatro submódulos, y decir «cubierto» daría por hecha una trazabilidad
 * —evaluación, mejora y actas— que todavía no existe.
 */
const CRITERIOS: readonly Criterio[] = [
  {
    numero: 1,
    nombre: 'Estudiantes',
    estado: 'pendiente',
    nota: 'Sin levantar.',
  },
  {
    numero: 2,
    nombre: 'Objetivos Educacionales del Programa',
    estado: 'cubierto',
    nota: 'Catálogo y asociación al plan, dentro de Plan de Estudios.',
  },
  {
    numero: 3,
    nombre: 'Atributos del Graduado',
    estado: 'cubierto',
    nota: 'Catálogo del marco, su mapeo a competencias y el reporte de cobertura.',
  },
  {
    numero: 4,
    nombre: 'Mejora Continua',
    estado: 'parcial',
    nota: 'Planes de medición disponibles. Faltan evaluación, mejora y actas.',
  },
  {
    numero: 5,
    nombre: 'Plan de Estudios',
    estado: 'cubierto',
    nota: 'Competencias, asignaturas, malla, aprobación y versionado.',
  },
  {
    numero: 6,
    nombre: 'Cuerpo de Profesores',
    estado: 'pendiente',
    nota: 'Sin levantar.',
  },
  {
    numero: 7,
    nombre: 'Instalaciones',
    estado: 'pendiente',
    nota: 'Sin levantar.',
  },
  {
    numero: 8,
    nombre: 'Apoyo Institucional',
    estado: 'pendiente',
    nota: 'Sin levantar.',
  },
];

const TONO: Record<EstadoCriterio, 'aprobado' | 'progreso' | 'inactivo'> = {
  cubierto: 'aprobado',
  parcial: 'progreso',
  pendiente: 'inactivo',
};

const ETIQUETA: Record<EstadoCriterio, string> = {
  cubierto: 'Cubierto',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
};

export function ResumenPage() {
  const { publicar } = useEncabezado();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Resumen' }], acciones: null });
    // `publicar` es estable dentro del render del layout; incluirlo dispararía
    // un bucle porque el contexto se recrea al publicar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mb-8">
        <p className="text-xs font-bold tracking-[0.16em] text-uc-primary uppercase">
          Sistema de Gestión de Calidad
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          Bienvenido al sistema de calidad
        </h1>
        <p className="mt-1.5 text-sm text-tinta-suave">
          Gestiona los procesos de acreditación y mejora continua de la Universidad Continental.
        </p>
      </div>

      <h2 className="mb-4 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
        Módulos activos
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        {ACTIVOS.map((m) => (
          <Link
            key={m.a}
            to={m.a}
            className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-uc-primary via-uc-v1 to-uc-dark p-8 transition hover:brightness-110"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-uc-v2 opacity-30"
            />
            <span className="relative block">
              <span className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-white uppercase">
                Módulo activo
              </span>
              <span className="mt-4 block text-2xl font-extrabold text-white">{m.titulo}</span>
              <span className="mt-2 block text-sm text-uc-lila-claro">{m.detalle}</span>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white">
                Abrir módulo
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="transition group-hover:translate-x-1"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 mb-1 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
        Cobertura de los criterios de acreditación
      </h2>
      <p className="mb-4 text-sm text-tinta-tenue">
        Los ocho criterios del modelo ICACIT y qué parte de cada uno soporta hoy el sistema.
      </p>

      <ol className="grid gap-3 sm:grid-cols-2">
        {CRITERIOS.map((c) => (
          <li
            key={c.numero}
            className="flex items-start gap-3 rounded-xl border border-borde bg-superficie p-4"
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-uc-lila-claro text-sm font-bold text-uc-primary"
            >
              {c.numero}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-tinta">{c.nombre}</span>
                <Badge tono={TONO[c.estado]}>{ETIQUETA[c.estado]}</Badge>
              </span>
              <span className="mt-1 block text-sm text-tinta-tenue">{c.nota}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
