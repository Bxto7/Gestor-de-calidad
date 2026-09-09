/** @vitest-environment jsdom */

/**
 * RF-PE-022 a RF-PE-030 en pantalla — la tarjeta de un plan de evaluación
 * **indirecta**.
 *
 * Lo que se vigila es lo que la tarjeta hermana aprendió a golpes: que «Guardar
 * el año» dispare de verdad los `PUT` y solo los de lo que cambió, que una
 * indicación a medio rellenar no se envíe arrastrando a las completas, que el
 * enlace a los resultados aparezca en cuanto la indicación tiene identidad
 * —también cuando la consulta se refresca **antes** de que el guardado
 * resuelva, que es el orden real— y que lo escrito después de guardar no se
 * pise.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConfiguracionDelPlan } from '../domain/tipos';
import { ConfiguracionDelAnio } from './ConfiguracionDelAnio';

const COMPETENCIAS = [
  { id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
  { id: 'c-2', codigo: 'CPE-02', nombre: 'Modelar sistemas' },
];

const VACIA: ConfiguracionDelPlan = { competencias: [], mediciones: [], indicaciones: [] };

/** Una indicación ya registrada en el año, con su identificador del servidor. */
const CON_UNA_INDICACION: ConfiguracionDelPlan = {
  competencias: [],
  mediciones: [],
  indicaciones: [
    {
      id: 'ind-1',
      periodoId: 'anio-1',
      grupoObjetivo: 'EGRESADOS',
      instruccion: 'Encuesta anual a egresados',
      enlaceInstrumento: 'https://e.test/f',
      enlaceResultados: null,
    },
  ],
};

/** Lo que devuelve la consulta refrescada tras el `PUT` del año. */
const CON_LA_INDICACION_YA_GUARDADA: ConfiguracionDelPlan = {
  competencias: [],
  mediciones: [],
  indicaciones: [
    {
      id: 'ind-1',
      periodoId: 'anio-1',
      grupoObjetivo: 'EGRESADOS',
      instruccion: 'Encuesta',
      enlaceInstrumento: 'https://e.test/f',
      enlaceResultados: null,
    },
  ],
};

/** Lo que devuelve la consulta refrescada tras el `PUT` de la competencia. */
const CON_EL_INSTRUMENTO_GUARDADO: ConfiguracionDelPlan = {
  competencias: [
    { competenciaId: 'c-1', instrumento: 'Encuesta', frecuencia: null, responsableId: null },
  ],
  mediciones: [],
  indicaciones: [],
};

function montar(sobre: Partial<Parameters<typeof ConfiguracionDelAnio>[0]> = {}) {
  const props = {
    competencias: COMPETENCIAS,
    periodo: { id: 'anio-1', etiqueta: '2026', orden: 1 },
    programadas: ['c-1|anio-1', 'c-2|anio-1'],
    configuracion: VACIA,
    docentes: [{ id: 'd-1', nombre: 'Ana Docente' }],
    editable: true,
    seguimientoEditable: true,
    onGuardarCompetencia: vi.fn(),
    onGuardarPorcentaje: vi.fn(),
    onGuardarIndicaciones: vi.fn(),
    onGuardarResultados: vi.fn(),
    ...sobre,
  };
  const { rerender } = render(<ConfiguracionDelAnio {...props} />);
  return {
    ...props,
    /** Vuelve a renderizar el mismo componente con otra `configuracion`. */
    conConfiguracion: (configuracion: ConfiguracionDelPlan) =>
      rerender(<ConfiguracionDelAnio {...props} configuracion={configuracion} />),
  };
}

describe('lo que la tarjeta indirecta muestra', () => {
  it('pinta las competencias programadas con su responsable (RF-PE-024)', () => {
    montar();

    for (const codigo of ['CPE-01', 'CPE-02']) {
      expect(screen.getByRole('textbox', { name: `Instrumento de ${codigo}` })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: `Frecuencia de ${codigo}` })).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: `Responsable de ${codigo}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('spinbutton', { name: `Porcentaje alcanzado de ${codigo}` }),
      ).toBeInTheDocument();
    }
  });

  it('y no ofrece el cruce con asignaturas, que es de la evaluación directa', () => {
    // El backend lo rechaza con `exigirTipo`: ofrecerlo aquí sería ofrecer un 409.
    montar();

    expect(screen.queryByRole('button', { name: 'Añadir asignatura' })).not.toBeInTheDocument();
  });
});

describe('RF-PE-027 — «Guardar el año» compone los `PUT`', () => {
  it('guarda solo lo que cambió, y a la competencia a la que le cambió', async () => {
    const p = montar();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrumento de CPE-02' }),
      'Encuesta',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(p.onGuardarCompetencia).toHaveBeenCalledTimes(1);
    expect(p.onGuardarCompetencia).toHaveBeenCalledWith(
      'c-2',
      expect.objectContaining({ instrumento: 'Encuesta' }),
    );
  });

  it('y manda siempre el responsable, porque el `PUT` reemplaza (RF-PE-024)', async () => {
    // Omitirlo del cuerpo lo borra: el backend lo dejó obligatorio en su DTO
    // justo para que un olvido no fuera un borrado silencioso.
    const p = montar();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Responsable de CPE-01' }),
      'd-1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(p.onGuardarCompetencia).toHaveBeenCalledWith('c-1', {
      instrumento: null,
      frecuencia: null,
      responsableId: 'd-1',
    });
  });

  it('no envía nada si no se tocó nada', async () => {
    const p = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(p.onGuardarCompetencia).not.toHaveBeenCalled();
    expect(p.onGuardarIndicaciones).not.toHaveBeenCalled();
    expect(p.onGuardarPorcentaje).not.toHaveBeenCalled();
    expect(p.onGuardarResultados).not.toHaveBeenCalled();
  });

  it('una indicación sin instrucción no se envía, pero las completas del año sí', async () => {
    // Mandar la fila a medias haría fallar el `PUT` entero —el DTO exige
    // instrucción y enlace— y con ella se perdería la que sí estaba completa.
    const p = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' }),
      'EGRESADOS',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }),
      'Encuesta anual',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' }),
      'https://e.test/f',
    );

    // La segunda queda a medias: sin instrucción.
    await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 2' }),
      'DOCENTES',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(p.onGuardarIndicaciones).toHaveBeenCalledWith('anio-1', [
      {
        grupoObjetivo: 'EGRESADOS',
        instruccion: 'Encuesta anual',
        enlaceInstrumento: 'https://e.test/f',
      },
    ]);
    expect(await screen.findByText('Guardado.')).toBeInTheDocument();
  });
});

describe('RF-PE-006 RN2 — las dos fronteras de edición', () => {
  // Sin `async`: no hay nada que esperar, y `@typescript-eslint/require-await`
  // rechaza la firma asíncrona que el pliego traía escrita.
  it('en un plan Vigente el enlace a resultados se edita y la instrucción no', () => {
    montar({ editable: false, seguimientoEditable: true, configuracion: CON_UNA_INDICACION });

    expect(screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' })).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' }),
    ).toBeEnabled();
  });

  it('el enlace a resultados no aparece en una indicación aún sin guardar', async () => {
    // RF-PE-029 lo asocia a una indicación ya registrada: sin `id` no hay a qué
    // asociarlo, y un campo que no puede guardarse es peor que uno ausente.
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));

    expect(
      screen.queryByRole('textbox', { name: /Enlace a los resultados/ }),
    ).not.toBeInTheDocument();
  });
});

describe('lo que la conciliación no puede pisar ni perder', () => {
  it('lo que el usuario escribió después de guardar no se pisa', async () => {
    const p = montar();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrumento de CPE-01' }),
      'Encuesta',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    await userEvent.type(screen.getByRole('textbox', { name: 'Frecuencia de CPE-01' }), 'Anual');
    p.conConfiguracion(CON_EL_INSTRUMENTO_GUARDADO); // llega el refresco

    expect(screen.getByRole('textbox', { name: 'Frecuencia de CPE-01' })).toHaveValue('Anual');
  });

  it('aunque la consulta se refresque antes de que el guardado resuelva', async () => {
    // El orden REAL: `onSettled` es async y se espera antes de que `mutateAsync`
    // resuelva, así que el doble debe provocar el rerender DENTRO de sí mismo,
    // antes de resolver su promesa. Una prueba que reenderice después prueba el
    // orden benigno y pasa aunque se pierdan datos: es el fallo exacto que 2c-B
    // dejó pasar una ronda entera.
    let refrescar: (c: ConfiguracionDelPlan) => void = () => {
      throw new Error('El guardado se disparó antes de montar el componente.');
    };
    const onGuardarIndicaciones = vi.fn(async () => {
      await Promise.resolve();
      refrescar(CON_LA_INDICACION_YA_GUARDADA); // trae el `id` recién asignado
    });

    const p = montar({ onGuardarIndicaciones });
    refrescar = p.conConfiguracion;

    await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' }),
      'EGRESADOS',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }),
      'Encuesta',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' }),
      'https://e.test/f',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    // Y ahora, sin recargar, los resultados de esa fila deben poder escribirse.
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' }),
      'https://e.test/r',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(p.onGuardarResultados).toHaveBeenCalledWith('ind-1', 'https://e.test/r');
  });

  it('y lo escrito mientras el guardado viajaba no queda dado por guardado', async () => {
    // La otra mitad del punto de comparación, la que ninguna de las seis
    // pruebas anteriores toca: toma la **identidad** del estado visible del
    // momento —los `id` que la conciliación acaba de adoptar—, pero el
    // **contenido** de lo que de verdad se envió. Si tomara también el
    // contenido, lo escrito mientras el `PUT` viajaba quedaría marcado como
    // guardado sin haber salido nunca, y el guardado siguiente no lo enviaría:
    // la misma pérdida silenciosa, por el otro extremo.
    //
    // Se comprueban las dos mitades del estado —la competencia y la
    // indicación— porque `baseTrasGuardar` las escribe en la misma línea y una
    // sola de las dos dejaría la otra sin red.
    const onGuardarIndicaciones = vi.fn(async () => {
      await Promise.resolve();
      // El usuario sigue escribiendo con el guardado en vuelo: los campos no se
      // desactivan, solo el botón.
      fireEvent.change(screen.getByRole('textbox', { name: 'Instrumento de CPE-01' }), {
        target: { value: 'Encuesta corregida' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }), {
        target: { value: 'Encuesta anual corregida' },
      });
    });

    const p = montar({ onGuardarIndicaciones });

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrumento de CPE-01' }),
      'Encuesta',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' }),
      'EGRESADOS',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }),
      'Encuesta anual',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' }),
      'https://e.test/f',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(onGuardarIndicaciones).toHaveBeenCalledTimes(2);
    expect(onGuardarIndicaciones.mock.calls[1]).toEqual([
      'anio-1',
      [
        {
          grupoObjetivo: 'EGRESADOS',
          instruccion: 'Encuesta anual corregida',
          enlaceInstrumento: 'https://e.test/f',
        },
      ],
    ]);
    expect(p.onGuardarCompetencia).toHaveBeenCalledTimes(2);
    expect(p.onGuardarCompetencia).toHaveBeenLastCalledWith(
      'c-1',
      expect.objectContaining({ instrumento: 'Encuesta corregida' }),
    );
  });
});

describe('RF-PE-030 — editar o eliminar una indicación registrada', () => {
  it('cambiar el grupo objetivo suelta el identificador de la fila', async () => {
    // El servidor guarda por (plan, año, grupo) y hace `upsert` sobre esa
    // terna: cambiar el grupo no edita la fila, crea otra y borra la anterior.
    // Conservar el `id` viejo dejaría el enlace a los resultados apuntando a un
    // registro que va a desaparecer, y RF-PE-029 se estrellaría contra un 404.
    const p = montar({ configuracion: CON_UNA_INDICACION });

    expect(
      screen.getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' }),
      'DOCENTES',
    );

    expect(
      screen.queryByRole('textbox', { name: /Enlace a los resultados/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(p.onGuardarIndicaciones).toHaveBeenCalledWith('anio-1', [
      expect.objectContaining({ grupoObjetivo: 'DOCENTES' }),
    ]);
    expect(p.onGuardarResultados).not.toHaveBeenCalled();
  });

  it('quitar una ya registrada pide confirmación y la deja fuera del año', async () => {
    const p = montar({ configuracion: CON_UNA_INDICACION });

    await userEvent.click(screen.getByRole('button', { name: 'Quitar la indicación 1' }));
    // Todavía no se ha ido: primero se confirma.
    expect(screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

    expect(
      screen.queryByRole('textbox', { name: 'Instrucción para EGRESADOS' }),
    ).not.toBeInTheDocument();
    expect(p.onGuardarIndicaciones).toHaveBeenCalledWith('anio-1', []);
  });
});
