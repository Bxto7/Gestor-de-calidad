/** @vitest-environment jsdom */

/**
 * RF-PE-013 a RF-PE-021 en pantalla.
 *
 * Lo que se vigila: que solo aparezcan las competencias programadas en el
 * periodo elegido (RF-PE-012), que el instrumento se anuncie como común a todos
 * los periodos (RF-PE-013 RN1), que el porcentaje sea uno por competencia y no
 * por asignatura (RF-PE-019 RN1), y que con el plan Vigente solo el porcentaje
 * y las evidencias acepten cambios.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConfiguracionDelPlan } from '../domain/tipos';
import { ConfiguracionDelPeriodo } from './ConfiguracionDelPeriodo';

const COMPETENCIAS = [
  { id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas' },
  { id: 'c-2', codigo: 'CPE-02', nombre: 'Modelar sistemas' },
];

function montar(sobre: Partial<Parameters<typeof ConfiguracionDelPeriodo>[0]> = {}) {
  const props = {
    competencias: COMPETENCIAS,
    periodo: { id: 'p-1', etiqueta: '2026-I', orden: 1 },
    programadas: ['c-1|p-1'],
    configuracion: { competencias: [], mediciones: [], indicaciones: [] },
    asignaturas: [
      { id: 'a-1', codigo: 'ASUC001', nombre: 'Cálculo I', cicloNumero: 1, activa: true },
    ],
    docentes: [{ id: 'd-1', nombre: 'Ana Docente' }],
    editable: true,
    seguimientoEditable: true,
    onGuardarCompetencia: vi.fn(),
    onGuardarAsignaturas: vi.fn(),
    onGuardarPorcentaje: vi.fn(),
    onGuardarEvidencias: vi.fn(),
    ...sobre,
  };
  const { rerender } = render(<ConfiguracionDelPeriodo {...props} />);
  return {
    ...props,
    /** Vuelve a renderizar el mismo componente con otra `configuracion`. */
    conConfiguracion: (configuracion: ConfiguracionDelPlan) =>
      rerender(<ConfiguracionDelPeriodo {...props} configuracion={configuracion} />),
  };
}

describe('RF-PE-012 — solo lo programado', () => {
  it('muestra la competencia programada en este periodo', () => {
    montar();

    // Por el encabezado y no por texto suelto: desde que los tres campos de
    // competencia llevan su código en la etiqueta (WCAG 2.4.6), «CPE-01»
    // aparece cuatro veces en la tarjeta.
    expect(screen.getByRole('heading', { name: /CPE-01/ })).toBeInTheDocument();
  });

  it('y no muestra la que no lo está', () => {
    // Enseñarla desactivada sería ofrecer algo que no se puede hacer: en este
    // periodo esa competencia no se mide, así que no hay nada que configurar.
    montar();

    expect(screen.queryByText(/CPE-02/)).not.toBeInTheDocument();
  });
});

describe('lo que el requisito exige que se vea', () => {
  it('avisa de que el instrumento vale para todos los periodos', () => {
    // RF-PE-013 RN1. Sin el aviso, quien lo edite creerá que configura solo
    // este periodo y se sorprenderá al abrir el siguiente.
    montar();

    expect(screen.getByText(/todos los periodos/i)).toBeInTheDocument();
  });

  it('el porcentaje es uno por competencia, no uno por asignatura', () => {
    // RF-PE-019 RN1.
    montar({
      configuracion: {
        competencias: [],
        indicaciones: [],
        mediciones: [
          {
            competenciaId: 'c-1',
            periodoId: 'p-1',
            porcentajeAlcanzado: 80,
            asignaturas: [
              {
                id: 'ae-1',
                asignaturaId: 'a-1',
                entregable: 'Proyecto',
                docenteId: null,
                evidencias: [],
              },
              {
                id: 'ae-2',
                asignaturaId: 'a-2',
                entregable: 'Informe',
                docenteId: null,
                evidencias: [],
              },
            ],
          },
        ],
      },
    });

    expect(screen.getAllByRole('spinbutton', { name: /porcentaje/i })).toHaveLength(1);
  });
});

describe('con el plan Vigente', () => {
  it('el porcentaje sigue aceptando cambios', () => {
    montar({ editable: false, seguimientoEditable: true });

    expect(screen.getByRole('spinbutton', { name: /porcentaje/i })).toBeEnabled();
  });

  it('pero el instrumento no, y dice por qué', () => {
    // Un campo desactivado y mudo hace pensar en un fallo. El motivo lo
    // convierte en información.
    montar({ editable: false, seguimientoEditable: true });

    expect(screen.getByRole('textbox', { name: /instrumento/i })).toBeDisabled();
    expect(screen.getByText(/aprobado|nueva versión/i)).toBeInTheDocument();
  });
});

describe('WCAG 2.4.6 — cada campo dice de qué competencia es', () => {
  it('con dos competencias programadas, los tres campos no comparten nombre', () => {
    // Los `id` ya eran únicos, así que `axe-core` pasaba; lo que no distinguía
    // era el nombre accesible. Con dos competencias, un lector de pantalla
    // anunciaba «Instrumento» dos veces sin decir de cuál.
    montar({ programadas: ['c-1|p-1', 'c-2|p-1'] });

    for (const codigo of ['CPE-01', 'CPE-02']) {
      expect(screen.getByRole('textbox', { name: `Instrumento de ${codigo}` })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: `Frecuencia de ${codigo}` })).toBeInTheDocument();
      expect(
        screen.getByRole('spinbutton', { name: `Porcentaje alcanzado de ${codigo}` }),
      ).toBeInTheDocument();
    }
  });

  it('y con dos filas en el cruce, tampoco lo comparten el entregable ni el docente', async () => {
    // Los dos campos que se quedaron fuera de la convención: llevaban etiqueta
    // pelada, repetida una vez por fila, mientras sus vecinas de la misma fila
    // —el selector de asignatura y el botón de quitar— sí desambiguaban.
    // `getByRole` falla si hay más de una coincidencia, así que esto también
    // afirma que los nombres son únicos.
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));
    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));

    for (const fila of [1, 2]) {
      expect(
        screen.getByRole('textbox', { name: `Entregable de la asignatura ${fila} de CPE-01` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', {
          name: `Docente responsable de la asignatura ${fila} de CPE-01`,
        }),
      ).toBeInTheDocument();
    }
  });
});

describe('RF-PE-020 — adjuntar evidencias sin recargar la página', () => {
  /**
   * Lo que devuelve la consulta refrescada tras el `PUT` de asignaturas: la
   * misma fila que se acaba de crear, ya con identificador propio.
   */
  const CON_LA_FILA_YA_GUARDADA: ConfiguracionDelPlan = {
    competencias: [],
    indicaciones: [],
    mediciones: [
      {
        competenciaId: 'c-1',
        periodoId: 'p-1',
        porcentajeAlcanzado: null,
        asignaturas: [
          {
            id: 'ae-1',
            asignaturaId: 'a-1',
            entregable: 'Proyecto',
            docenteId: null,
            evidencias: [],
          },
        ],
      },
    ],
  };

  it('una fila recién guardada acepta evidencias en cuanto la consulta la devuelve', async () => {
    // El camino que lo rompía: plan en Borrador, «Añadir asignatura», elegirla,
    // escribir el entregable, «Guardar el periodo». Salía «Guardado.» y debajo
    // seguía «Guarda el periodo para poder adjuntar evidencias de esta fila.»
    // indefinidamente, porque el estado local se derivaba de `configuracion`
    // una sola vez al montar y `fila.aeId` seguía en `null`.
    const { conConfiguracion } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Asignatura 1 de CPE-01' }),
      'a-1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
      'Proyecto',
    );
    expect(screen.getByText(/Guarda el periodo para poder adjuntar/)).toBeInTheDocument();

    conConfiguracion(CON_LA_FILA_YA_GUARDADA);

    expect(screen.getByRole('button', { name: 'Añadir evidencia' })).toBeInTheDocument();
    expect(screen.queryByText(/Guarda el periodo para poder adjuntar/)).not.toBeInTheDocument();
  });

  it('y sus evidencias sí se envían en el guardado siguiente', async () => {
    // El recorrido entero de RF-PE-020 en una sola visita: añadir la fila,
    // guardarla, adjuntarle una evidencia y volver a guardar. La consulta se
    // refresca **después** de que el guardado resuelva; el orden contrario
    // —el que ocurre de verdad— lo cubre la prueba siguiente.
    //
    // La comparación de evidencias empareja las filas por `aeId`
    // (`anterior.filas.find(f => f.aeId === fila.aeId)`), así que el `aeId`
    // adoptado tiene que entrar también en el punto de comparación. Si la
    // conciliación solo alcanzara al estado visible, la fila nunca encontraría
    // su pareja en la base y la evidencia no llegaría a enviarse: quedaría
    // escrita en pantalla y perdida al recargar, que es peor que no dejar
    // escribirla.
    const props = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Asignatura 1 de CPE-01' }),
      'a-1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
      'Proyecto',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    props.conConfiguracion(CON_LA_FILA_YA_GUARDADA);

    await userEvent.click(screen.getByRole('button', { name: 'Añadir evidencia' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Enlace de la evidencia 1/ }),
      'https://drive.example/acta',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Descripción de la evidencia 1/ }),
      'Acta de sustentación',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarEvidencias).toHaveBeenCalledWith('ae-1', [
      { enlace: 'https://drive.example/acta', descripcion: 'Acta de sustentación' },
    ]);
  });

  it('aunque la consulta se refresque antes de que el guardado resuelva', async () => {
    // El orden real, que la prueba de arriba no reproduce.
    // `useMutacionDeConfiguracion` declara `onSettled` como `async` y espera
    // dentro al `invalidateQueries`, y React Query no resuelve `mutateAsync`
    // hasta que `onSettled` termina. Cuando `await onGuardarAsignaturas(…)`
    // regresa, la consulta **ya** se refrescó y la conciliación durante el
    // renderizado ya adoptó el `aeId` en el estado visible.
    //
    // Escribir entonces el punto de comparación con la instantánea del cierre
    // —capturada antes de esa conciliación, con `aeId: null`— lo deja sin la
    // identidad que el estado visible sí tiene, y en el guardado siguiente la
    // fila no encuentra su pareja: se ve «Guardado.» y la evidencia no sale
    // hacia el servidor. Es peor que el bloqueo visible que vino a sustituir,
    // porque no avisa.
    let refrescar: (configuracion: ConfiguracionDelPlan) => void = () => {
      throw new Error('El guardado se disparó antes de tener el componente montado.');
    };
    const onGuardarAsignaturas = vi.fn(async () => {
      // Entre el `PUT` y la resolución de la promesa, como hace `onSettled`.
      await Promise.resolve();
      refrescar(CON_LA_FILA_YA_GUARDADA);
    });

    const props = montar({ onGuardarAsignaturas });
    refrescar = props.conConfiguracion;

    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Asignatura 1 de CPE-01' }),
      'a-1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
      'Proyecto',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    await userEvent.click(screen.getByRole('button', { name: 'Añadir evidencia' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Enlace de la evidencia 1/ }),
      'https://drive.example/acta',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Descripción de la evidencia 1/ }),
      'Acta de sustentación',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarEvidencias).toHaveBeenCalledWith('ae-1', [
      { enlace: 'https://drive.example/acta', descripcion: 'Acta de sustentación' },
    ]);
  });

  it('y lo escrito mientras el guardado viajaba no queda dado por guardado', async () => {
    // La otra mitad del punto de comparación: toma la **identidad** del estado
    // visible del momento —los `aeId` que la conciliación acaba de adoptar—,
    // pero el **contenido** de lo que de verdad se envió. Si tomara también el
    // contenido, lo que se escribió mientras el `PUT` viajaba quedaría marcado
    // como guardado sin haber salido nunca, y el guardado siguiente no lo
    // enviaría: la misma clase de pérdida silenciosa, por el otro extremo.
    const onGuardarAsignaturas = vi.fn(async () => {
      await Promise.resolve();
      // El usuario sigue escribiendo con el guardado en vuelo: el campo no se
      // desactiva, solo el botón.
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
        { target: { value: 'Proyecto corregido' } },
      );
    });

    montar({ onGuardarAsignaturas });

    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Asignatura 1 de CPE-01' }),
      'a-1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
      'Proyecto',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(onGuardarAsignaturas).toHaveBeenCalledTimes(2);
    expect(onGuardarAsignaturas.mock.calls[1]).toEqual([
      'c-1',
      [{ asignaturaId: 'a-1', entregable: 'Proyecto corregido', docenteId: null }],
    ]);
  });

  it('y lo que el usuario escribió después de guardar no se pisa', async () => {
    // La conciliación adopta el `aeId`, no recarga la fila. Pisar el entregable
    // con el del servidor sería perder trabajo para arreglar un campo que ni
    // siquiera se ve.
    const { conConfiguracion } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir asignatura' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Asignatura 1 de CPE-01' }),
      'a-1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
      'Proyecto corregido',
    );

    conConfiguracion(CON_LA_FILA_YA_GUARDADA);

    expect(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
    ).toHaveValue('Proyecto corregido');
  });
});

/**
 * RF-PE-021 — «Guardar el periodo» compone los cuatro `PUT`.
 *
 * Sin estas pruebas, reducir `guardarPeriodo` a `setMensaje('Guardado.')` —cero
 * peticiones— dejaba las 202 del frontend en verde. Lo que se afirma aquí es lo
 * que quedaba sin cubrir: qué callback se dispara, con qué argumentos, la
 * detección de cambios contra la base, el filtrado de filas sin asignatura, el
 * recorrido sobre **varias** competencias y el bucle de evidencias.
 */
describe('guardar el periodo', () => {
  const CONFIGURADO: ConfiguracionDelPlan = {
    competencias: [
      {
        competenciaId: 'c-1',
        instrumento: 'Rúbrica',
        frecuencia: 'Semestral',
        responsableId: null,
      },
    ],
    indicaciones: [],
    mediciones: [
      {
        competenciaId: 'c-1',
        periodoId: 'p-1',
        porcentajeAlcanzado: 50,
        asignaturas: [
          {
            id: 'ae-1',
            asignaturaId: 'a-1',
            entregable: 'Proyecto',
            docenteId: null,
            evidencias: [{ id: 'ev-1', enlace: 'https://uno', descripcion: 'Rúbrica' }],
          },
        ],
      },
      { competenciaId: 'c-2', periodoId: 'p-1', porcentajeAlcanzado: null, asignaturas: [] },
    ],
  };

  function montarDos() {
    return montar({ programadas: ['c-1|p-1', 'c-2|p-1'], configuracion: CONFIGURADO });
  }

  it('envía solo lo que cambió, y a la competencia a la que le cambió', async () => {
    const props = montarDos();

    await userEvent.clear(screen.getByRole('textbox', { name: 'Instrumento de CPE-01' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Instrumento de CPE-01' }),
      'Lista de cotejo',
    );
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-02' }),
      '90',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarCompetencia).toHaveBeenCalledTimes(1);
    expect(props.onGuardarCompetencia).toHaveBeenCalledWith('c-1', {
      instrumento: 'Lista de cotejo',
      frecuencia: 'Semestral',
    });
    expect(props.onGuardarPorcentaje).toHaveBeenCalledTimes(1);
    expect(props.onGuardarPorcentaje).toHaveBeenCalledWith('c-2', 90);
    // Lo que no cambió no se guarda: ni el porcentaje de CPE-01, ni el
    // instrumento de CPE-02, ni sus asignaturas, ni sus evidencias.
    expect(props.onGuardarAsignaturas).not.toHaveBeenCalled();
    expect(props.onGuardarEvidencias).not.toHaveBeenCalled();
    expect(await screen.findByText('Guardado.')).toBeInTheDocument();
  });

  it('no envía nada si no se tocó nada', async () => {
    const props = montarDos();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarCompetencia).not.toHaveBeenCalled();
    expect(props.onGuardarAsignaturas).not.toHaveBeenCalled();
    expect(props.onGuardarPorcentaje).not.toHaveBeenCalled();
    expect(props.onGuardarEvidencias).not.toHaveBeenCalled();
  });

  it('una fila a medio rellenar no se envía, pero las completas de su cruce sí', async () => {
    // «Añadir asignatura» crea una fila sin asignatura elegida. Mandarla haría
    // fallar el `PUT` entero por una fila que el usuario aún no ha terminado, y
    // con ella se perderían las que sí estaban.
    const props = montarDos();

    await userEvent.click(screen.getAllByRole('button', { name: 'Añadir asignatura' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarAsignaturas).toHaveBeenCalledTimes(1);
    expect(props.onGuardarAsignaturas).toHaveBeenCalledWith('c-1', [
      { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
    ]);
  });

  it('el entregable se envía recortado, como el instrumento', async () => {
    // El DTO lo recorta también; enviarlo con espacios de los lados hacía que
    // dos entregables escritos igual dejaran de parecerse.
    const props = montarDos();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Entregable de la asignatura 1 de CPE-01' }),
      '   ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarAsignaturas).toHaveBeenCalledWith('c-1', [
      { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
    ]);
  });

  it('las evidencias de una fila se envían por su identificador', async () => {
    const props = montarDos();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Enlace de la evidencia 1/ }),
      '/anexo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el periodo' }));

    expect(props.onGuardarEvidencias).toHaveBeenCalledTimes(1);
    expect(props.onGuardarEvidencias).toHaveBeenCalledWith('ae-1', [
      { enlace: 'https://uno/anexo', descripcion: 'Rúbrica' },
    ]);
    expect(props.onGuardarCompetencia).not.toHaveBeenCalled();
  });
});
