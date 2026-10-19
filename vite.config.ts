import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || '/';
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,svg,json}', '**/*latin-full*.woff2', '**/figtree-latin-wght*.woff2'],
          globIgnores: ['**/*latin-ext*']
        },
        includeAssets: ['icons/*.png', 'icons/*.svg'],
        manifest: {
          id: base,
          name: 'Ritual',
          short_name: 'Ritual',
          description: 'Seu dia, registrado com poucos toques.',
          lang: 'pt-BR',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F1E8D8',
          theme_color: '#F1E8D8',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg}', '**/*latin-full*.woff2', '**/figtree-latin-wght*.woff2'],
          globIgnores: ['**/*latin-ext*'],
          navigateFallback: base + 'index.html',
          navigateFallbackDenylist: [/^\/auth/],
          runtimeCaching: []
        }
      })
    ],
    test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] }
  } as any;
});
