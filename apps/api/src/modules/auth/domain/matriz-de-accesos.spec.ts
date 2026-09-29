import { describe, expect, it } from 'vitest';

import { ROLES } from './matriz-de-accesos.js';

function permisosOrdenados(codigo: string): string[] {
  const rol = ROLES.find((r) => r.codigo === codigo);
  if (!rol) throw new Error(`No existe el rol ${codigo} en la matriz.`);
  return [...rol.permisos].sort();
}

describe('Matriz de accesos vigente tras el MVP1 (RF-CH-002 a 005)', () => {
  it('ADMIN_SISTEMA: Facultades y Sistema, sin Acreditación ni Mejora Continua', () => {
    expect(permisosOrdenados('ADMIN_SISTEMA')).toEqual(
      [
        'auditoria.leer',
        'asignatura.leer',
        'carrera.crear',
        'carrera.editar',
        'carrera.inactivar',
        'carrera.leer',
        'competencia.leer',
        'facultad.crear',
        'facultad.editar',
        'facultad.inactivar',
        'facultad.leer',
        'objetivo.leer',
        'plan.leer',
        'plan.leer_historico',
        'rol.gestionar',
        'usuario.gestionar',
      ].sort(),
    );
  });

  it('DIRECTOR_CARRERA: pierde Sistema, Acreditación, Medición y Evaluación y Mejora; conserva Plan de Estudios y Actas', () => {
    expect(permisosOrdenados('DIRECTOR_CARRERA')).toEqual(
      [
        'asignatura.gestionar',
        'asignatura.leer',
        'actas.aprobar',
        'actas.crear',
        'actas.editar',
        'actas.eliminar',
        'actas.leer',
        'auditoria.leer',
        'carrera.leer',
        'competencia.gestionar',
        'competencia.leer',
        'facultad.leer',
        'malla.editar',
        'objetivo.gestionar',
        'objetivo.leer',
        'plan.aprobar',
        'plan.crear',
        'plan.editar',
        'plan.eliminar',
        'plan.enviar_revision',
        'plan.justificar',
        'plan.leer',
        'plan.leer_historico',
        'plan.nueva_version',
        'plan.observar',
        'reporte.generar',
      ].sort(),
    );
  });

  it('COORDINADOR_ACADEMICO: pierde Plan de Estudios y Sistema; conserva Acreditación y Mejora Continua', () => {
    expect(permisosOrdenados('COORDINADOR_ACADEMICO')).toEqual(
      [
        'actas.crear',
        'actas.editar',
        'actas.eliminar',
        'actas.leer',
        'atributo.gestionar',
        'atributo.leer',
        'auditoria.leer_entidad',
        'carrera.leer',
        'criterio.gestionar',
        'criterio.leer',
        'evaluacion.crear',
        'evaluacion.editar',
        'evaluacion.eliminar',
        'evaluacion.leer',
        'facultad.leer',
        'medicion.crear',
        'medicion.editar',
        'medicion.eliminar',
        'medicion.leer',
        'mejora.crear',
        'mejora.editar',
        'mejora.eliminar',
        'mejora.leer',
        'reporte.generar',
      ].sort(),
    );
  });
});
