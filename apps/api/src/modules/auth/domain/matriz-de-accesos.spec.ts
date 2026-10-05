import { describe, expect, it } from 'vitest';

import { PERMISOS, ROLES } from './matriz-de-accesos.js';

function permisosOrdenados(codigo: string): string[] {
  const rol = ROLES.find((r) => r.codigo === codigo);
  if (!rol) throw new Error(`No existe el rol ${codigo} en la matriz.`);
  return [...rol.permisos].sort();
}

describe('Matriz de accesos vigente tras el MVP1 (RF-CH-002 a 005)', () => {
  it('ADMIN_SISTEMA: solo Facultades y Sistema; no lee contenido de planes (RF-CH-008)', () => {
    expect(permisosOrdenados('ADMIN_SISTEMA')).toEqual(
      [
        'auditoria.leer',
        'carrera.crear',
        'carrera.editar',
        'carrera.inactivar',
        'carrera.leer',
        'facultad.crear',
        'facultad.editar',
        'facultad.inactivar',
        'facultad.leer',
        'plan.acceder',
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
        'lectura.solo_su_carrera',
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
        'lectura.solo_su_carrera',
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
        'lectura.solo_su_carrera',
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

  it('Director, Coordinador y Docente leen solo su carrera (Bloques 6a y 6b); el Consultor y el Administrador, todas', () => {
    const quienes = ROLES.filter((r) => r.permisos.includes('lectura.solo_su_carrera')).map(
      (r) => r.codigo,
    );
    expect(quienes).toEqual(['DIRECTOR_CARRERA', 'COORDINADOR_ACADEMICO', 'DOCENTE']);
  });

  it('el Administrador no tiene ningún permiso de lectura de planes ni de su contenido', () => {
    const permisos = permisosOrdenados('ADMIN_SISTEMA');
    for (const ajeno of [
      'plan.leer',
      'plan.leer_historico',
      'objetivo.leer',
      'competencia.leer',
      'asignatura.leer',
    ]) {
      expect(permisos).not.toContain(ajeno);
    }
  });

  it('todo permiso asignado a un rol existe en el catálogo', () => {
    const catalogo = new Set<string>(PERMISOS.map(([codigo]) => codigo));
    const huerfanos = ROLES.flatMap((r) =>
      r.permisos.filter((p) => !catalogo.has(p)).map((p) => `${r.codigo}: ${p}`),
    );
    expect(huerfanos).toEqual([]);
  });
});

describe('Módulo de los permisos de acreditación (RF-CH-026)', () => {
  it('la descripción de .gestionar dice que incluye eliminar (RF-CH-029, RF-CH-032)', () => {
    const descripciones = new Map(PERMISOS.map(([codigo, descripcion]) => [codigo, descripcion]));
    expect(descripciones.get('atributo.gestionar')).toBe(
      'Crear, editar, inactivar y eliminar atributos del graduado',
    );
    expect(descripciones.get('criterio.gestionar')).toBe(
      'Crear, editar, inactivar y eliminar criterios de acreditación',
    );
  });

  it('atributo.* y criterio.* pertenecen al módulo acreditacion', () => {
    const modulos = new Map<string, string>(PERMISOS.map(([codigo, , modulo]) => [codigo, modulo]));
    for (const permiso of [
      'atributo.leer',
      'atributo.gestionar',
      'criterio.acceder',
      'criterio.leer',
      'criterio.gestionar',
    ]) {
      expect(modulos.get(permiso), permiso).toBe('acreditacion');
    }
  });

  it('quién tiene qué no cambió: solo el Coordinador gestiona; el Consultor lee; el Docente solo lee criterios', () => {
    const conPermiso = (permiso: string) =>
      ROLES.filter((r) => r.permisos.includes(permiso))
        .map((r) => r.codigo)
        .sort();

    expect(conPermiso('atributo.gestionar')).toEqual(['COORDINADOR_ACADEMICO']);
    expect(conPermiso('criterio.gestionar')).toEqual(['COORDINADOR_ACADEMICO']);
    expect(conPermiso('atributo.leer')).toEqual(['COORDINADOR_ACADEMICO', 'USUARIO_CONSULTOR']);
    expect(conPermiso('criterio.leer')).toEqual([
      'COORDINADOR_ACADEMICO',
      'DOCENTE',
      'USUARIO_CONSULTOR',
    ]);
    expect(conPermiso('criterio.acceder')).toEqual(['COORDINADOR_ACADEMICO', 'USUARIO_CONSULTOR']);
  });
});
