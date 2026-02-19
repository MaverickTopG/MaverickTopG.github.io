import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/volunteer/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('/firebase/') || id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
                return 'firebase';
              }
              if (id.includes('node_modules/framer-motion')) return 'motion';
              if (id.includes('node_modules/@google/generative-ai')) return 'genai';
              if (id.includes('node_modules/lucide-react')) return 'icons';
              if (id.includes('node_modules/xlsx') || id.includes('node_modules/jspdf')) return 'exports';
              if (id.includes('node_modules/gsap')) return 'gsap';
              return 'vendor';
            },
          },
        },
      },
    };
});
