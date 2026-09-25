/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';

import type { EvaluacionAsignada } from '../api/mis-evidencias.api';
import { TarjetaEvaluacion } from './TarjetaEvaluacion';

const base: EvaluacionAsignada = {
  id: 'ae-1',
  asignatura: { id: 'a1', codigo: 'BD', nombre: 'Base de Datos' },
  competencia: { id: 'k1', codigo: 'CPE-01', nombre: 'Diseño de soluciones' },
  entregable: 'Proyecto final',
  periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: '2026-07-15' },
  planEvaluacion: { id: 'pev-1', codigo: 'EV-1' },
  evidencias: [
    { id: 'x1', enlace: 'https://ejemplo.pe/mia', descripcion: 'Acta mía', propia: true },
    {
      id: 'x2',
      enlace: 'https://ejemplo.pe/ajena',
      descripcion: 'Acta del coordinador',
      propia: false,
    },
  ],
  puedeAgregar: true,
};

type Agregar = (id: string, datos: { enlace: string; descripcion: string }) => Promise<void>;
type Retirar = (evidenciaId: string) => Promise<void>;

function montar(
  evaluacion: EvaluacionAsignada = base,
  manejadores: { onAgregar?: Mock<Agregar>; onRetirar?: Mock<Retirar> } = {},
) {
  const onAgregar = manejadores.onAgregar ?? vi.fn<Agregar>().mockResolvedValue(undefined);
  const onRetirar = manejadores.onRetirar ?? vi.fn<Retirar>().mockResolvedValue(undefined);
  render(<TarjetaEvaluacion evaluacion={evaluacion} onAgregar={onAgregar} onRetirar={onRetirar} />);
  return { onAgregar, onRetirar };
}

describe('TarjetaEvaluacion — lectura', () => {
  it('muestra la competencia, el entregable y el periodo con su fecha de cierre', () => {
    montar();
    expect(screen.getByText(/CPE-01/)).toBeInTheDocument();
    expect(screen.getByText(/Diseño de soluciones/)).toBeInTheDocument();
    expect(screen.getByText(/Proyecto final/)).toBeInTheDocument();
    expect(screen.getByText(/2026-I/)).toBeInTheDocument();
    expect(screen.getByText(/15 jul/)).toBeInTheDocument();
  });

  it('sin fecha de cierre no inventa una', () => {
    montar({ ...base, periodo: { ...base.periodo, fechaCierre: null } });
    expect(screen.getByText(/sin fecha de cierre/i)).toBeInTheDocument();
  });

  it('cada evidencia es un enlace que abre en pestaña nueva y sin dar acceso al origen', () => {
    montar();
    const enlace = screen.getByRole('link', { name: 'Acta mía' });
    expect(enlace).toHaveAttribute('href', 'https://ejemplo.pe/mia');
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sin evidencias lo dice', () => {
    montar({ ...base, evidencias: [] });
    expect(
      screen.getByText('Aún no registraste evidencias en esta evaluación.'),
    ).toBeInTheDocument();
  });
});

describe('TarjetaEvaluacion — retirar', () => {
  it('solo las evidencias propias tienen botón «Retirar»', () => {
    montar();
    expect(screen.getAllByRole('button', { name: /^Retirar/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retirar Acta mía' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retirar Acta del coordinador' }),
    ).not.toBeInTheDocument();
  });

  it('retirar pide confirmación y no llama hasta confirmar', async () => {
    const { onRetirar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));

    expect(onRetirar).not.toHaveBeenCalled();
    expect(screen.getByText('¿Retirar esta evidencia?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onRetirar).toHaveBeenCalledWith('x1');
  });

  it('cancelar la confirmación no retira nada y vuelve al botón', async () => {
    const { onRetirar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onRetirar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retirar Acta mía' })).toBeInTheDocument();
  });

  it('si el servidor rechaza el retiro muestra su mensaje', async () => {
    montar(base, {
      onRetirar: vi
        .fn()
        .mockRejectedValue(
          new Error('El plan de evaluación EV-1 no está vigente; ya no admite evidencias.'),
        ),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El plan de evaluación EV-1 no está vigente; ya no admite evidencias.',
    );
  });
});

describe('TarjetaEvaluacion — foco y confirmación', () => {
  it('la confirmación es un grupo con nombre y el foco pasa a «Confirmar» al abrirla', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));

    expect(screen.getByRole('group', { name: 'Confirmar retiro de Acta mía' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
  });

  it('cancelar devuelve el foco al botón «Retirar» de esa evidencia', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Retirar Acta mía' })).toHaveFocus();
  });

  it('un retiro fallido devuelve el foco al botón «Retirar»', async () => {
    montar(base, { onRetirar: vi.fn<Retirar>().mockRejectedValue(new Error('No se pudo.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Retirar Acta mía' })).toHaveFocus();
  });

  it('un retiro logrado lleva el foco a la propia tarjeta, porque la fila ya no existe', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: /Base de Datos/ })).toHaveFocus(),
    );
  });

  it('un doble clic en «Confirmar» retira una sola vez', async () => {
    const onRetirar = vi.fn<Retirar>().mockReturnValue(new Promise(() => undefined));
    montar(base, { onRetirar });
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    await userEvent.dblClick(confirmar);

    expect(onRetirar).toHaveBeenCalledTimes(1);
    expect(confirmar).toBeDisabled();
  });

  it('el error de un retiro anterior se quita al abrir otra confirmación', async () => {
    montar(base, { onRetirar: vi.fn<Retirar>().mockRejectedValue(new Error('No se pudo.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo.');

    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancelar también quita el error de un retiro anterior', async () => {
    montar(base, { onRetirar: vi.fn<Retirar>().mockRejectedValue(new Error('No se pudo.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Retirar Acta mía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('TarjetaEvaluacion — enlaces y límites', () => {
  it('un enlace guardado con otro esquema se muestra como texto, no como enlace', () => {
    montar({
      ...base,
      evidencias: [
        { id: 'x9', enlace: 'javascript:alert(1)', descripcion: 'Trampa guardada', propia: false },
      ],
    });
    expect(screen.getByText('Trampa guardada')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trampa guardada' })).not.toBeInTheDocument();
  });

  it('los campos llevan los límites del servidor', () => {
    montar();
    expect(screen.getByLabelText('Enlace de la evidencia')).toHaveAttribute('maxlength', '2000');
    expect(screen.getByLabelText('Descripción')).toHaveAttribute('maxlength', '200');
  });
});

describe('TarjetaEvaluacion — agregar', () => {
  it('con puedeAgregar muestra el formulario con sus dos campos etiquetados', () => {
    montar();
    expect(screen.getByLabelText('Enlace de la evidencia')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar evidencia' })).toBeInTheDocument();
  });

  it('envía el enlace y la descripción recortados, y limpia el formulario', async () => {
    const { onAgregar } = montar();
    await userEvent.type(
      screen.getByLabelText('Enlace de la evidencia'),
      '  https://ejemplo.pe/nueva ',
    );
    await userEvent.type(screen.getByLabelText('Descripción'), '  Informe técnico ');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(onAgregar).toHaveBeenCalledWith('ae-1', {
      enlace: 'https://ejemplo.pe/nueva',
      descripcion: 'Informe técnico',
    });
    expect(await screen.findByLabelText('Enlace de la evidencia')).toHaveValue('');
    expect(screen.getByLabelText('Descripción')).toHaveValue('');
  });

  it('con un campo vacío no envía y lo dice junto al campo', async () => {
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('Descripción'), 'Solo descripción');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(onAgregar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el enlace de la evidencia.')).toBeInTheDocument();
  });

  it('un enlace que no empieza por http:// o https:// no se envía', async () => {
    const { onAgregar } = montar();
    await userEvent.type(screen.getByLabelText('Enlace de la evidencia'), 'javascript:alert(1)');
    await userEvent.type(screen.getByLabelText('Descripción'), 'Trampa');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(onAgregar).not.toHaveBeenCalled();
    expect(screen.getByText('El enlace debe empezar por http:// o https://.')).toBeInTheDocument();
  });

  it.each(['https://', 'http://intranet', 'https://intranet/doc'])(
    'el enlace «%s» no pasa el cliente y se explica en español, como lo haría el servidor',
    async (enlace) => {
      const { onAgregar } = montar();
      await userEvent.type(screen.getByLabelText('Enlace de la evidencia'), enlace);
      await userEvent.type(screen.getByLabelText('Descripción'), 'Doc');
      await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

      expect(onAgregar).not.toHaveBeenCalled();
      expect(
        screen.getByText('Escribe un enlace válido, por ejemplo https://ejemplo.pe/documento.'),
      ).toBeInTheDocument();
    },
  );

  it('si el servidor rechaza el alta muestra su mensaje y conserva lo escrito', async () => {
    montar(base, {
      onAgregar: vi.fn().mockRejectedValue(new Error('Esta evaluación ya tiene 20 evidencias.')),
    });
    await userEvent.type(screen.getByLabelText('Enlace de la evidencia'), 'https://ejemplo.pe/x');
    await userEvent.type(screen.getByLabelText('Descripción'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta evaluación ya tiene 20 evidencias.',
    );
    expect(screen.getByLabelText('Enlace de la evidencia')).toHaveValue('https://ejemplo.pe/x');
  });

  it('sin puedeAgregar no hay formulario y se explica por qué', () => {
    montar({ ...base, puedeAgregar: false });
    expect(screen.queryByLabelText('Enlace de la evidencia')).not.toBeInTheDocument();
    expect(screen.getByText('Esta evaluación ya tiene 20 evidencias.')).toBeInTheDocument();
  });

  it('cada campo repetido dice a qué evaluación pertenece para lectores de pantalla', () => {
    montar();
    // Con varias tarjetas, «Enlace de la evidencia» a secas se repite: la región de la tarjeta lo distingue.
    expect(
      screen.getByRole('region', { name: /Base de Datos.*CPE-01.*2026-I/ }),
    ).toBeInTheDocument();
    const region = screen.getByRole('region', { name: /Base de Datos/ });
    expect(within(region).getByLabelText('Enlace de la evidencia')).toBeInTheDocument();
  });
});
