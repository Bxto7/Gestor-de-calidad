/**
 * Analiza la página actual contra WCAG 2.1 AA, que es el objetivo declarado en
 * CLAUDE.md §6.2 y lo que §6.6 exige en cada PR que toque interfaz.
 *
 * El mensaje de fallo lleva la regla, su impacto y el selector del elemento: sin
 * eso, un fallo de axe es un identificador y una búsqueda web, y quien lo lea
 * dentro de tres meses no sabrá por dónde empezar.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function analizar(page: Page, donde: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();

  const informe = violations
    .map(
      (v) =>
        `  [${v.impact ?? 'sin impacto'}] ${v.id}: ${v.help}\n` +
        v.nodes.map((n) => `      ${n.target.join(' ')}`).join('\n'),
    )
    .join('\n');

  expect(violations, `Incumplimientos de WCAG 2.1 AA en ${donde}:\n${informe}`).toEqual([]);
}
