/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a nova versão só é ativada quando a pesquisa está na tela inicial,
      // nunca no meio de uma partida (ver src/services/pwa.ts).
      registerType: 'prompt',
      injectRegister: false,
      // Idem para os ícones do manifesto: já estão no globPatterns.
      includeManifestIcons: false,
      // Os arquivos de public/ já entram pelo globPatterns abaixo; listá-los também em
      // includeAssets duplica entradas e o Workbox aborta o pré-cache (nada fica offline).
      manifest: {
        name: 'Pesquisa Massa FM',
        short_name: 'Pesquisa Massa',
        description: 'Pesquisa da Rádio Massa FM Toledo 98.5 para totem touchscreen em eventos.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#f7a819',
        theme_color: '#f7a819',
        icons: [
          { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ico,json}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
