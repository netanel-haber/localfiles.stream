import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    server: {
        port: 5173,
        strictPort: false,
        hmr: {
            protocol: 'ws',
            host: 'localhost',
            port: 5173,
        },
    },
    plugins: [
        VitePWA({
            registerType: 'prompt',
            devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'index.html',
            },
            manifest: {
                name: 'localfiles.stream',
                short_name: 'localfiles',
                description: 'Play your local audio/video files',
                theme_color: '#121212',
                background_color: '#121212',
                display: 'standalone',
                icons: [
                    {
                        src: 'icon.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any'
                    }
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/localfiles\.stream\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'localfiles-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                            },
                        },
                    },
                ],
                navigateFallbackDenylist: [/^\/api\//],
                skipWaiting: true,
                clientsClaim: true,
            },
        }),
    ],
}); 