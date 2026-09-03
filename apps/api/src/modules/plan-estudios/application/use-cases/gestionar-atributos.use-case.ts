/**
 * Casos de uso de los atributos del graduado (RF120–RF123, RF128).
 *
 * El atributo es catálogo del marco de acreditación, no de un plan: su código
 * es único dentro del marco. Por eso la autorización se pide sin carrera, igual
 * que en el catálogo de competencias.
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
  AtributoCreado,
  AtributoEditado,
  AtributoEstadoCambiado,
  AtributosDePlanDeclarados,
} from '../../domain/events/eventos-acreditacion.js';
import { limpiarNombre } from '../../domain/value-objects/codigos.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  ImpactoAtributo,
  RepositorioAtributoPort,
} from '../ports/acreditacion.port.js';

/**
 * Único marco en uso. Cuando haya más, saldrá del actor o de la carrera.
 *
 * Constante local y no exportada, igual que en `gestionar-catalogo.use-case.ts`
 * y `consultar-reportes.use-case.ts`: es la convención que ya sigue el módulo.
 */
const MARCO_VIGENTE = 'ICACIT';

export class GestionarAtributos {
  constructor(
    private readonly atributos: RepositorioAtributoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF122 y RF128: listado con búsqueda sobre código y nombre. */
  async listar(actor: Actor, filtro?: FiltroAcreditacion): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer');
    return this.atributos.listar(MARCO_VIGENTE, filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.leer');
    return this.exigirAtributo(id);
  }

  /** RF120: el código es único dentro del marco. */
  async crear(actor: Actor, codigo: string, nombre: string): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(MARCO_VIGENTE, codigoLimpio)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe un atributo del graduado con el código ${codigoLimpio} en el marco ${MARCO_VIGENTE}.`,
      );
    }

    const orden = (await this.atributos.ultimoOrden(MARCO_VIGENTE)) + 1;
    const creado = await this.atributos.crear(MARCO_VIGENTE, codigoLimpio, limpio, orden);

    await this.eventos.publicar([
      new AtributoCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF121: revalida la unicidad excluyendo el propio registro. */
  async editar(
    actor: Actor,
    id: string,
    codigo: string,
    nombre: string,
  ): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const previo = await this.exigirAtributo(id);
    const limpio = validarNombre(nombre);
    const codigoLimpio = validarCodigo(codigo);

    if (await this.atributos.codigoExiste(MARCO_VIGENTE, codigoLimpio, id)) {
      throw new ReglaDeNegocioViolada(
        `Ya existe otro atributo del graduado con el código ${codigoLimpio}.`,
      );
    }

    const editado = await this.atributos.actualizar(id, codigoLimpio, limpio);

    await this.eventos.publicar([
      new AtributoEditado(actor, id, previo.codigo, editado.codigo, previo.nombre, editado.nombre),
    ]);
    return editado;
  }

  /** RF123: el aviso previo. Consultar el impacto no muta, así que basta leer. */
  async impactoDeInactivar(actor: Actor, id: string): Promise<ImpactoAtributo> {
    await this.exigir(actor, 'atributo.leer');
    await this.exigirAtributo(id);
    return this.atributos.impactoDeInactivar(id);
  }

  /**
   * RF123 RN1: inactivar conserva el registro. No hay borrado físico.
   *
   * El impacto se consulta antes de escribir para que quede en la bitácora:
   * cuántas competencias quedaron sin el atributo es justo lo que una
   * acreditación pregunta después, cuando el aviso ya no existe.
   */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosAtributoCompleto> {
    await this.exigir(actor, 'atributo.gestionar');
    const previo = await this.exigirAtributo(id);

    if (previo.activo === activo) {
      throw new ReglaDeNegocioViolada(
        `El atributo del graduado ${previo.codigo} ya está ${activo ? 'activo' : 'inactivo'}.`,
      );
    }

    const impacto = activo
      ? { competenciasVinculadas: 0, planesVinculados: 0 }
      : await this.atributos.impactoDeInactivar(id);

    const cambiado = await this.atributos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new AtributoEstadoCambiado(
        actor,
        id,
        cambiado.codigo,
        activo,
        impacto.competenciasVinculadas,
      ),
    ]);
    return cambiado;
  }

  /** RF122: los atributos que este plan de estudios adopta. */
  async delPlan(actor: Actor, planId: string): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.leer');
    return this.atributos.delPlan(planId);
  }

  /** Reemplaza el conjunto completo declarado por el plan, de forma atómica. */
  async declararEnPlan(
    actor: Actor,
    planId: string,
    atributoIds: readonly string[],
  ): Promise<DatosAtributoCompleto[]> {
    await this.exigir(actor, 'atributo.gestionar');

    // La clave primaria de `plan_atributo` es compuesta: un identificador
    // repetido reventaría el INSERT. Mandarlo dos veces expresa lo mismo que
    // mandarlo una, así que se normaliza en lugar de rechazar.
    const unicos = [...new Set(atributoIds)];

    const invalidos = await this.atributos.inexistentesOInactivos(unicos);
    if (invalidos.length > 0) {
      throw new ReglaDeNegocioViolada(
        `Estos atributos del graduado no existen o están inactivos: ${invalidos.join(', ')}.`,
      );
    }

    const antes = await this.atributos.delPlan(planId);
    const despues = await this.atributos.declararEnPlan(planId, unicos);

    await this.eventos.publicar([
      new AtributosDePlanDeclarados(
        actor,
        planId,
        antes.map((a) => a.codigo),
        despues.map((a) => a.codigo),
      ),
    ]);
    return despues;
  }

  private async exigirAtributo(id: string): Promise<DatosAtributoCompleto> {
    const encontrado = await this.atributos.porId(id);
    if (!encontrado) throw new NoEncontrado('el atributo del graduado', id);
    return encontrado;
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/** RNF08: el motivo del rechazo tiene que ser el concreto, no «datos inválidos». */
function validarNombre(nombre: string): string {
  const limpio = limpiarNombre(nombre);
  if (limpio.length < 3) {
    throw new ReglaDeNegocioViolada('El nombre del atributo del graduado no puede quedar vacío.');
  }
  return limpio;
}

function validarCodigo(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  if (limpio.length === 0) {
    throw new ReglaDeNegocioViolada('El código del atributo del graduado es obligatorio.');
  }
  return limpio;
}
