/**
 * Casos de uso de los criterios de acreditación (RF129–RF132).
 *
 * El criterio pertenece a una carrera y no a un plan de estudios: describe al
 * programa, que sobrevive a sus sucesivos planes. Su código es único dentro de
 * la carrera, no en todo el sistema: dos programas pueden llamar «C-01» a
 * criterios distintos sin que eso sea un choque.
 *
 * Por eso la autorización se pide **con** carrera, a diferencia de los
 * atributos del graduado: el Director gestiona los criterios de la suya.
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
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  CriterioCreado,
  CriterioEditado,
  CriterioEstadoCambiado,
} from '../../domain/events/eventos-acreditacion.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosCriterio,
  FiltroAcreditacion,
  ImpactoCriterio,
  RepositorioCriterioPort,
} from '../ports/acreditacion.port.js';

export class GestionarCriterios {
  constructor(
    private readonly criterios: RepositorioCriterioPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF131 RN1: el listado sale ordenado por código; lo garantiza el adaptador. */
  async listar(
    actor: Actor,
    carreraId: string,
    filtro?: FiltroAcreditacion,
  ): Promise<DatosCriterio[]> {
    await this.exigir(actor, 'criterio.leer', carreraId);
    return this.criterios.listar(carreraId, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosCriterio> {
    const criterio = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.leer', criterio.carreraId);
    return criterio;
  }

  /** RF129: el código es único dentro de la carrera. */
  async crear(
    actor: Actor,
    carreraId: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosCriterio> {
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
  async editar(
    actor: Actor,
    id: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosCriterio> {
    const previo = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.gestionar', previo.carreraId);
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

  /** RF132: el aviso previo. Leer el impacto no muta nada. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoCriterio> {
    const criterio = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.leer', criterio.carreraId);
    return this.criterios.impactoDeInactivar(id);
  }

  /** RF132 RN1: no se elimina físicamente. RN2: lo ya asociado se conserva. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosCriterio> {
    const previo = await this.exigirCriterio(id);
    await this.exigir(actor, 'criterio.gestionar', previo.carreraId);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El criterio de acreditación ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const cambiado = await this.criterios.cambiarEstado(id, activo);

    await this.eventos.publicar([new CriterioEstadoCambiado(actor, id, cambiado.codigo, activo)]);
    return cambiado;
  }

  private async exigirCriterio(id: string): Promise<DatosCriterio> {
    const encontrado = await this.criterios.porId(id);
    if (!encontrado) throw new NoEncontrado('el criterio de acreditación', id);
    return encontrado;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RF130 RN1 y RNF08: el motivo concreto, no «datos inválidos». */
function validarNombre(nombre: string): string {
  const limpio = limpiarNombre(nombre);
  if (limpio.length < 3) {
    throw new ReglaDeNegocioViolada('El nombre del criterio de acreditación no puede quedar vacío.');
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
