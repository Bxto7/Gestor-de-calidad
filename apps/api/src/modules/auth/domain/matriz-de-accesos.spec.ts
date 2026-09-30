import { describe, expect, it } from 'vitest';

import { PERMISOS, ROLES } from './matriz-de-accesos.js';

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
        'plan.acceder',
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
        'docente.gestionar',
        'facultad.leer',
        'malla.editar',
        'objetivo.gestionar',
        'objetivo.leer',
        'plan.acceder',
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

  it('COORDINADOR_ACADEMICO: sin módulo Plan de Estudios ni Sistema; aprueba los planes de Mejora Continua', () => {
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
        'competencia.leer',
        'criterio.acceder',
        'criterio.gestionar',
        'criterio.leer',
        'evaluacion.acceder',
        'evaluacion.aprobar',
        'evaluacion.crear',
        'evaluacion.editar',
        'evaluacion.eliminar',
        'evaluacion.leer',
        'facultad.leer',
        'medicion.aprobar',
        'medicion.crear',
        'medicion.editar',
        'medicion.eliminar',
        'medicion.leer',
        'mejora.aprobar',
        'mejora.crear',
        'mejora.editar',
        'mejora.eliminar',
        'mejora.leer',
        'objetivo.leer',
        'plan.leer',
        'reporte.generar',
      ].sort(),
    );
  });

  it('COORDINADOR_ACADEMICO no recibe plan.acceder: lee planes, objetivos y competencias sin entrar al módulo', () => {
    expect(permisosOrdenados('COORDINADOR_ACADEMICO')).not.toContain('plan.acceder');
  });

  it('USUARIO_CONSULTOR conserva la entrada a Plan de Estudios, Evaluación y Criterios', () => {
    const permisos = permisosOrdenados('USUARIO_CONSULTOR');
    expect(permisos).toContain('plan.acceder');
    expect(permisos).toContain('evaluacion.acceder');
    expect(permisos).toContain('criterio.acceder');
  });

  it('DOCENTE: Planes de Mejora, Mis evidencias y las lecturas que esas pantallas consumen (RF-CH-006)', () => {
    expect(permisosOrdenados('DOCENTE')).toEqual(
      [
        'carrera.leer',
        'competencia.leer',
        'criterio.leer',
        'evaluacion.leer',
        'evidencia.registrar',
        'mejora.leer',
        'objetivo.leer',
      ].sort(),
    );
  });

  it('DOCENTE no tiene ningún permiso que abra un módulo que no es suyo', () => {
    const permisos = permisosOrdenados('DOCENTE');
    for (const ajeno of [
      'plan.acceder',
      'plan.leer',
      'medicion.leer',
      'atributo.leer',
      'actas.leer',
      'evaluacion.acceder',
      'criterio.acceder',
      'reporte.generar',
    ]) {
      expect(permisos).not.toContain(ajeno);
    }
  });

  it('solo el Director tiene docente.gestionar', () => {
    const quienes = ROLES.filter((r) => r.permisos.includes('docente.gestionar')).map(
      (r) => r.codigo,
    );
    expect(quienes).toEqual(['DIRECTOR_CARRERA']);
  });

  it('todo permiso asignado a un rol existe en el catálogo', () => {
    const catalogo = new Set<string>(PERMISOS.map(([codigo]) => codigo));
    const huerfanos = ROLES.flatMap((r) =>
      r.permisos.filter((p) => !catalogo.has(p)).map((p) => `${r.codigo}: ${p}`),
    );
    expect(huerfanos).toEqual([]);
  });
});
