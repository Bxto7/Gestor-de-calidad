import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import type { DatosUsuario } from '../../application/ports/gestion-usuarios.port.js';
import type { GestionarDocentes } from '../../application/use-cases/gestionar-docentes.use-case.js';
import { aDocenteDto, DocentesDeCarreraController } from './docentes-de-carrera.controller.js';

const ACTOR: Actor = { id: 'dir-1', nombre: 'Rosa Vidal' };

const cuenta: DatosUsuario = {
  id: 'doc-1',
  email: 'luis@sgc.local',
  nombreCompleto: 'Luis Ramos',
  activo: true,
  roles: [{ codigo: 'DOCENTE', nombre: 'Docente' }],
  carreraId: 'carrera-isi',
  creadoEn: new Date('2026-01-01'),
  ultimaActividad: null,
};

describe('aDocenteDto', () => {
  it('expone solo lo que la pantalla necesita, sin roles ni carrera ni credenciales', () => {
    expect(aDocenteDto(cuenta)).toEqual({
      id: 'doc-1',
      email: 'luis@sgc.local',
      nombreCompleto: 'Luis Ramos',
      activo: true,
      creadoEn: new Date('2026-01-01'),
    });
  });
});

describe('DocentesDeCarreraController', () => {
  it('crear devuelve el docente sin la contraseña que se envió', async () => {
    const casos = { crear: async () => cuenta } as unknown as GestionarDocentes;
    const controlador = new DocentesDeCarreraController(casos);

    const r = await controlador.crear(ACTOR, {
      nombreCompleto: 'Luis Ramos',
      email: 'luis@sgc.local',
      password: 'Clave.Docente.1',
    });

    expect(JSON.stringify(r)).not.toContain('Clave.Docente.1');
    expect(Object.keys(r).sort()).toEqual(['activo', 'creadoEn', 'email', 'id', 'nombreCompleto']);
  });

  it('listar mapea cada cuenta', async () => {
    const casos = { listar: async () => [cuenta] } as unknown as GestionarDocentes;
    const controlador = new DocentesDeCarreraController(casos);

    expect(await controlador.listar(ACTOR)).toEqual([aDocenteDto(cuenta)]);
  });
});
