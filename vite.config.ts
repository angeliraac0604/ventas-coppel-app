import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['pwa-icon.png'],
        manifest: {
          name: 'Registro de Ventas Coppel (BETA)',
          short_name: 'Ventas Beta',
          description: 'Aplicación de registro de ventas y cierres',
          theme_color: '#2563eb',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Fix: Specifically include the MAIN key as well
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
      'import.meta.env.VITE_GEMINI_API_KEY_2': JSON.stringify(env.VITE_GEMINI_API_KEY_2),
      'import.meta.env.VITE_GEMINI_API_KEY_3': JSON.stringify(env.VITE_GEMINI_API_KEY_3),
      'import.meta.env.VITE_GEMINI_API_KEY_4': JSON.stringify(env.VITE_GEMINI_API_KEY_4),
      'import.meta.env.VITE_GEMINI_API_KEY_5': JSON.stringify(env.VITE_GEMINI_API_KEY_5),
      'import.meta.env.VITE_GEMINI_API_KEY_6': JSON.stringify(env.VITE_GEMINI_API_KEY_6)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
