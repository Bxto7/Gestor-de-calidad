/**
 * Configuración de la suite E2E.
 *
 * `workers: 1` no es una precaución vaga: el backend genera el código del plan
 * de medición con un correlativo por plan de estudios y tipo, así que dos
 * pruebas en paralelo competirían por el mismo número y una fallaría por una
 * razón que no es la que prueba.
 *
 * Solo Chromium. La aplicación es interna y vive detrás de un login; las
 * diferencias entre motores no son el riesgo que hay que cubrir hoy.
 *
 * `webServer` sirve el bundle ya construido, no el servidor de desarrollo: lo
 * que Caddy servirá en producción es esto (§5.2). La API se levanta fuera, en
 * el job de CI o a mano en local, porque necesita su base preparada primero.
 */

import { defineConfig, devices } from '@playwright/test';

export const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  // En CI, un reintento distingue el fallo real del parpadeo de red; en local,
  // ninguno: un reintento silencioso esconde justo lo que se quiere ver.
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['html'], ['github']] : [['list']],
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // La traza solo del reintento: guardarla siempre engorda el artefacto sin
    // que nadie la mire cuando la prueba pasó.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run preview -- --port 4173',
    cwd: '../../apps/web',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
