/**
 * 3.1 Inicio / Resumen — shell de navegación, sin RF asociados.
 *
 * Una tarjeta destacada para el único módulo que existe y tres atenuadas para
 * lo que viene. Las de "Próximamente" no son enlaces ni botones: si no llevan a
 * ningún lado, no deben parecer pulsables.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/AppLayout';
import { Badge } from '@/shared/components/ui';

const PROXIMOS = [
  {
    titulo: 'Evaluaciones y Medición',
    detalle: 'Instrumentos de evaluación, rúbricas y medición de logro de competencias.',
  },
  {
    titulo: 'Planes de Mejora',
    detalle: 'Seguimiento de acciones correctivas derivadas de los procesos de acreditación.',
  },
  {
    titulo: 'Cuerpo Docente',
    detalle: 'Perfil, categoría y carga académica del personal docente.',
  },
];

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

      <Link
        to="/plan-estudios"
        className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-uc-primary via-uc-v1 to-uc-dark p-8 transition hover:brightness-110"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-uc-v2 opacity-30"
        />
        <span className="relative block max-w-xl">
          <span className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-white uppercase">
            Módulo activo
          </span>
          <span className="mt-4 block text-2xl font-extrabold text-white">Plan de Estudios</span>
          <span className="mt-2 block text-sm text-uc-lila-claro">
            Facultades, carreras, objetivos educacionales, competencias, asignaturas y malla
            curricular. Incluye el flujo de aprobación y el versionado del plan.
          </span>
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

      <h2 className="mt-10 mb-4 text-xs font-bold tracking-[0.14em] text-tinta-suave uppercase">
        Próximos módulos
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROXIMOS.map((m) => (
          <div
            key={m.titulo}
            className="rounded-2xl border border-dashed border-borde bg-superficie p-5 opacity-70"
          >
            <Badge tono="inactivo">Próximamente</Badge>
            <p className="mt-3 text-base font-bold text-tinta-suave">{m.titulo}</p>
            <p className="mt-1 text-sm text-tinta-tenue">{m.detalle}</p>
          </div>
        ))}
      </div>
    </>
  );
}
