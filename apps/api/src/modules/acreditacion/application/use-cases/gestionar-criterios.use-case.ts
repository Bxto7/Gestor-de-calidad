/**
 * Casos de uso de los criterios de acreditación (RF129–RF132, RF-CH-030/031).
 *
 * El criterio pertenece a una carrera y no a un plan de estudios: describe al
 * programa, que sobrevive a sus sucesivos planes. Su código es único dentro de la
 * carrera, no en todo el sistema: dos programas pueden llamar «C-01» a criterios
 * distintos sin que eso sea un choque.
 *
 * `criterio.gestionar` está acotado a la carrera que el usuario dirige. Orden de
 * comprobación: (1) permiso de lectura; (2) existencia y alcance de lectura de la
 * carrera —de la ruta o de la fila—: inexistente o fuera del alcance es
 * NoEncontrado (RF-CH-009), nunca AccesoDenegado; (3) permiso de gestión acotado;
 * (4) reglas de negocio. El Coordinador, el único que gestiona, tiene alcance de
 * lectura `TODAS`: lee otras carreras y lo que se le rechaza es escribir.
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  CriterioCreado,
  CriterioEditado,
  CriterioEstadoCambiado,
} from '../../domain/events/eventos-criterio.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type { CriterioEnUsoPort } from '../ports/criterio-en-uso.port.js';
import type {
  DatosCriterio,
  FiltroAcreditacion,
  ImpactoCriterio,
  RepositorioCriterioPort,
} from '../ports/criterios.port.js';

export class GestionarCriterios {
  constructor(
    private readonly criterios: RepositorioCriterioPort,
    private readonly carreras: AcademicoCrossModuloPort,
    private readonly enUso: CriterioEnUsoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}

  /** RF131 RN1: el listado sale ordenado por código; lo garantiza el adaptador. */
  async listar(
    actor: Actor,
    carreraId: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosCriterio[]> {
    await this.exigir(actor, 'criterio.leer', null);
    await this.carreraLegible(actor, carreraId);
    return this.criterios.listar(carreraId, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    return this.criterioLegible(actor, id);
  }

  /** RF129 y RF-CH-030: el código es único dentro de la carrera de la ruta. */
  async crear(
    actor: Actor,
    carreraId: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    await this.carreraLegible(actor, carreraId);
    await this.exigir(actor, 'criterio.gestionar', carreraId);

    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.criterios.codigoExiste(carreraId, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un criterio de acreditación con el código ${codigoLimpio} en esta carrera.`,
      );
    }

    const creado = await this.criterios.crear(carreraId, codigoLimpio, limpio);

    await this.eventos.publicar([
      new CriterioCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF130: revalida unicidad excluyendo el propio registro. RN2: queda auditado. */
  async editar(actor: Actor, id: string, codigo: string, nombre: string): Promise<DatosCriterio> {
    const previo = await this.filaGestionable(actor, id);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.criterios.codigoExiste(previo.carreraId, codigoLimpio, id)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe otro criterio de acreditación con el código ${codigoLimpio} en esta carrera.`,
      );
    }

    const editado = await this.criterios.actualizar(id, codigoLimpio, limpio);

    await this.eventos.publicar([
      new CriterioEditado(actor, id, previo.codigo, editado.codigo, previo.nombre, editado.nombre),
    ]);
    return editado;
  }

  /** RF132: el aviso previo. Leer el impacto no muta nada, así que basta el permiso de lectura. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    await this.criterioLegible(actor, id);
    return { planesMejoraVinculados: await this.enUso.contarPlanesDeMejora(id) };
  }

  /** RF132 RN1: inactivar conserva el registro. RN2: lo ya asociado se conserva. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosCriterio> {
    const previo = await this.filaGestionable(actor, id);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El criterio de acreditación ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const cambiado = await this.criterios.cambiarEstado(id, activo);

    await this.eventos.publicar([new CriterioEstadoCambiado(actor, id, cambiado.codigo, activo)]);
    return cambiado;
  }

  /* ── Apoyo ──────────────────────────────────────────────────────────── */

  /** Lectura, existencia, alcance y gestión sobre la carrera de la fila. */
  private async filaGestionable(actor: Actor, id: string): Promise<DatosCriterio> {
    await this.exigir(actor, 'criterio.leer', null);
    const actual = await this.criterioLegible(actor, id);
    await this.exigir(actor, 'criterio.gestionar', actual.carreraId);
    return actual;
  }

  /** El criterio existe y su carrera entra en el alcance de lectura; si no, NoEncontrado. */
  private async criterioLegible(actor: Actor, id: string): Promise<DatosCriterio> {
    const criterio = await this.criterios.porId(id);
    if (!criterio || !(await this.alcance.puedeLeerCarrera(actor.id, criterio.carreraId))) {
      throw new NoEncontrado('el criterio de acreditación', id);
    }
    return criterio;
  }

  /** La carrera existe y entra en el alcance de lectura; si no, NoEncontrado. */
  private async carreraLegible(actor: Actor, carreraId: string): Promise<void> {
    const carrera = await this.carreras.carreraPorId(carreraId);
    if (!carrera || !(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado('la carrera', carreraId);
    }
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RF130 RN1 y RNF08: el motivo concreto, no «datos inválidos». */
function validarNombre(nombre: string): string {
  const limpio = limpiarNombre(nombre);
  if (limpio.length < 3) {
    throw new ReglaDeNegocioViolada(
      'El nombre del criterio de acreditación no puede quedar vacío.',
    );
  }
  return limpio;
}

function validarCodigo(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  if (limpio.length === 0) {
    throw new ReglaDeNegocioViolada('El código del criterio de acreditación es obligatorio.');
  }
  return limpio;
}
