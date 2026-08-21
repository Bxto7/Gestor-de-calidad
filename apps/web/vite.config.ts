import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Evita cadenas de `../../../` al importar entre features.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // El frontend pide a `/api/v1/...` en relativo y Vite lo reenvía al backend.
    // Así el código no distingue entre desarrollo y producción —donde Caddy
    // sirve ambos bajo el mismo dominio (§5.2)— y de paso no hay CORS que
    // configurar: para el navegador, todo viene del mismo origen.
    proxy: {
      '/api': {
        target: process.env['VITE_API_PROXY'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
