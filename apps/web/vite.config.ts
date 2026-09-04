import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// El frontend pide a `/api/v1/...` en relativo y Vite lo reenvía al backend.
// Así el código no distingue entre desarrollo y producción —donde Caddy sirve
// ambos bajo el mismo dominio (§5.2)— y de paso no hay CORS que configurar:
// para el navegador, todo viene del mismo origen.
//
// Se comparte entre `server` y `preview` porque `preview` **no** hereda el de
// `server`, y las pruebas E2E corren contra el bundle construido —que es lo que
// Caddy servirá— y no contra el servidor de desarrollo. Sin esto, `vite preview`
// devolvería el `index.html` también para `/api` y cada petición fallaría al
// intentar leer HTML como JSON.
const proxy = {
  '/api': {
    target: process.env['VITE_API_PROXY'] ?? 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Evita cadenas de `../../../` al importar entre features.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
