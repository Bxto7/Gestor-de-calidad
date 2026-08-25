/**
 * Frontera de errores de render.
 *
 * Sin una, un fallo en cualquier pantalla desmonta el árbol entero de React y
 * deja la ventana en blanco: sin mensaje, sin rastro y sin forma de salir salvo
 * recargar, que es algo que nadie hace si no sabe que ha pasado algo. Quien la
 * usa concluye que la aplicación "no responde" o "no se actualiza", y tiene
 * razón desde donde lo mira.
 *
 * Va por dentro del layout, alrededor del contenido de la ruta: así la barra
 * lateral sigue viva y el usuario puede irse a otra pantalla en vez de quedarse
 * encerrado. Se reinicia al cambiar de ruta —de eso se encarga la `key` de quien
 * la monta—, porque una frontera que no se reinicia convierte un fallo puntual
 * en una pantalla rota para el resto de la sesión.
 *
 * No sustituye a arreglar el fallo: el error se sigue enviando a la consola
 * íntegro, porque tragárselo sería cambiar un problema visible por uno invisible.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface Estado {
  error: Error | null;
}

export class LimiteDeError extends Component<Props, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // A la consola tal cual, con el árbol de componentes: es lo que permite
    // localizar el fallo. Aquí iría el envío a un servicio de errores cuando lo
    // haya (CLAUDE.md §5.8).
    console.error('Fallo al renderizar la pantalla:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-2xl border border-alerta-borde bg-alerta-bg px-6 py-8 text-center"
      >
        <h2 className="text-lg font-extrabold text-alerta-fg">No se pudo mostrar esta pantalla</h2>
        <p className="mt-2 text-sm text-tinta-suave">
          Algo falló al dibujarla. Tus datos no se han visto afectados: esto ocurrió en el
          navegador, no al guardar.
        </p>

        {/*
          El mensaje técnico se muestra en vez de esconderse. Quien reporta la
          incidencia puede copiarlo, y sin él el aviso no ayuda a nadie a
          arreglar nada.
        */}
        <p className="mt-4 rounded-lg bg-white/70 px-3 py-2 text-left font-mono text-xs text-tinta-suave">
          {error.message}
        </p>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-uc-primary px-5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-uc-primary"
        >
          Recargar la página
        </button>
      </div>
    );
  }
}
