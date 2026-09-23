/**
 * Casos de uso de objetivos educacionales (RF033–RF039).
 *
 * Movido de `plan-estudios` (Fase 0c del dashboard por rol) — ver §2.4
 * del spec de Fase 0. Objetivo y Competencia compartían archivo y
 * eventos genéricos en `plan-estudios`; separados, cada uno vive en su
 * propio módulo con su propio vocabulario de eventos (ver
 * `eventos-objetivo.ts`, Task 2 Step 2).
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
  ObjetivoCreado,
  ObjetivoEditado,
  ObjetivoEliminado,
  ObjetivoEstadoCambiado,
} from '../../domain/events/eventos-objetivo.js';
import { limpiarNombre, siguienteCodigoObjetivo } from '../../domain/value-objects/codigos.js';
import type {
  DatosObjetivo,
  FiltroObjetivo,
  RepositorioObjetivoPort,
} from '../ports/objetivos.port.js';

export class GestionarObjetivos {
  constructor(
    private readonly objetivos: RepositorioObjetivoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF035 y RF039: listado con búsqueda sobre nombre y código. */
  async listar(actor: Actor, filtro?: FiltroObjetivo): Promise<DatosObjetivo[]> {
    await this.exigir(actor, 'objetivo.leer');
    return this.objetivos.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer');
    const objetivo = await this.objetivos.porId(id);
    if (!objetivo) throw new NoEncontrado('el objetivo educacional', id);
    return objetivo;
  }

  /** RF033 y RF034: alta con código correlativo generado por el sistema. */
  async crear(actor: Actor, nombre: string, descripcion: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.gestionar');
    const limpio = await this.validar(nombre, descripcion);

    const codigo = siguienteCodigoObjetivo(await this.objetivos.codigos());
    const creado = await this.objetivos.crear(codigo, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ObjetivoCreado(actor, creado.id, creado.codigo, creado.nombre),
    ]);
    return creado;
  }

  /** RF036: RN1 dice que el código no cambia al editar, y por eso no se toca. */
  async editar(
    actor: Actor,
    id: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    const limpio = await this.validar(nombre, descripcion, id);
    const editado = await this.objetivos.actualizar(id, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ObjetivoEditado(
        actor,
        id,
        actual.codigo,
        actual.nombre,
        limpio.nombre,
        actual.descripcion !== limpio.descripcion,
      ),
    ]);
    return editado;
  }

  /** RF037: RN1 prohíbe el borrado físico por esta vía. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    const cambiado = await this.objetivos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new ObjetivoEstadoCambiado(actor, id, actual.codigo, activo, actual.planesVinculados),
    ]);
    return cambiado;
  }

  /** RF038: solo lo que no está vinculado a ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await this.exigir(actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    if (actual.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: ${actual.planesVinculados} plan(es) lo tienen asociado. ` +
          'Inactívalo si ya no debe usarse en planes nuevos.',
      );
    }

    // El evento se emite antes de borrar: después, el código y el nombre que
    // necesita el detalle ya no existirían en ninguna parte.
    await this.eventos.publicar([new ObjetivoEliminado(actor, id, actual.codigo, actual.nombre)]);
    await this.objetivos.eliminar(id);
  }

  private async validar(
    nombre: string,
    descripcion: string,
    idIgnorado?: string,
  ): Promise<{ nombre: string; descripcion: string }> {
    const limpio = limpiarNombre(nombre);
    const sumilla = descripcion.trim();

    // RF033 RN1: ambos obligatorios.
    if (!limpio) throw new ReglaDeNegocioViolada('El nombre del objetivo es obligatorio.');
    if (!sumilla) throw new ReglaDeNegocioViolada('La descripción del objetivo es obligatoria.');

    if (await this.objetivos.existeNombre(limpio, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otro objetivo educacional con ese nombre.');
    }
    return { nombre: limpio, descripcion: sumilla };
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    // Sin carrera: el catálogo es institucional, igual que la estructura académica.
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
