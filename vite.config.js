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
            strategies: 'injectManifest',
            srcDir: 'public',
            filename: 'sw.js',
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
                share_target: {
                    action: "/share-target",
                    method: "POST",
                    enctype: "multipart/form-data",
                    params: {
                        files: [
                            {
                                name: "media",
                                accept: ["audio/*", "video/*"]
                            }
                        ]
                    }
                },
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                navigateFallbackDenylist: [/^\/api\//, /^\/share-target$/],
                skipWaiting: true,
                clientsClaim: true,
            },
        }),
    ],
}); 