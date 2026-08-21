/**
 * Pruebas de la consulta de bitácora.
 *
 * Lo que se fija aquí es el techo del listado y el permiso. La bitácora crece
 * sin límite: una pantalla que la pidiera entera se volvería más lenta cuanto
 * más se usara el sistema, que es la peor forma de degradarse.
 */

import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { FiltroBitacora, RepositorioBitacoraPort } from '../ports/bitacora.port.js';
import { ConsultarBitacora } from './consultar-bitacora.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Administrador' };

function montar(permitido = true) {
  const recibidos: FiltroBitacora[] = [];
  const permisos: string[] = [];

  const repo: RepositorioBitacoraPort = {
    listar: async (filtro) => {
      recibidos.push(filtro);
      return [];
    },
  };

  const autorizacion: AuthorizationPort = {
    puede: async (_id, permiso) => {
      permisos.push(permiso);
      return permitido ? { permitido: true } : { permitido: false, motivo: 'Sin permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };

  return { caso: new ConsultarBitacora(repo, autorizacion), recibidos, permisos };
}

describe('Permiso', () => {
  it('exige auditoria.leer', async () => {
    const { caso, permisos } = montar();
    await caso.ejecutar(ACTOR, {});
    expect(permisos).toEqual(['auditoria.leer']);
  });

  it('deniega sin él', async () => {
    const { caso, recibidos } = montar(false);
    await expect(caso.ejecutar(ACTOR, {})).rejects.toBeInstanceOf(AccesoDenegado);
    expect(recibidos).toHaveLength(0);
  });
});

describe('Filtros', () => {
  it('traslada entidad e identificador', async () => {
    const { caso, recibidos } = montar();
    await caso.ejecutar(ACTOR, { entidad: 'Plan', entidadId: 'p-1' });
    expect(recibidos[0]).toMatchObject({ entidad: 'Plan', entidadId: 'p-1' });
  });

  it('filtrar por tipo sin decir cuál se rechaza', async () => {
    // Devolvería el histórico de todas las facultades a la vez: no es lo que
    // pide ninguna pantalla, y sí un listado caro.
    const { caso, recibidos } = montar();
    await expect(caso.ejecutar(ACTOR, { entidad: 'Facultad' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    expect(recibidos).toHaveLength(0);
  });

  it('un identificador suelto sí vale: es una entidad concreta', async () => {
    const { caso } = montar();
    await expect(caso.ejecutar(ACTOR, { entidadId: 'p-1' })).resolves.toEqual([]);
  });
});

describe('Techo del listado', () => {
  it('aplica un tope por defecto', async () => {
    const { caso, recibidos } = montar();
    await caso.ejecutar(ACTOR, {});
    expect(recibidos[0]?.limite).toBe(200);
  });

  it('respeta un límite menor', async () => {
    const { caso, recibidos } = montar();
    await caso.ejecutar(ACTOR, { limite: 20 });
    expect(recibidos[0]?.limite).toBe(20);
  });

  it('recorta uno mayor en vez de obedecerlo', async () => {
    const { caso, recibidos } = montar();
    await caso.ejecutar(ACTOR, { limite: 100_000 });
    expect(recibidos[0]?.limite).toBe(200);
  });
});
