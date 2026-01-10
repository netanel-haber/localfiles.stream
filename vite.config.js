import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

// Get the commit SHA from main branch (not current branch or gh-pages)
const getCommitSha = () => {
    try {
        // First try to get from environment variable (for CI/CD builds)
        if (process.env.VITE_COMMIT_SHA) {
            return process.env.VITE_COMMIT_SHA;
        }

        // Otherwise get the SHA from the main branch
        // Try origin/main first, then fall back to main
        try {
            return execSync('git rev-parse origin/main').toString().trim();
        } catch {
            return execSync('git rev-parse main').toString().trim();
        }
    } catch (error) {
        console.warn('Could not get commit SHA:', error);
        return 'unknown';
    }
};

export default defineConfig({
    define: {
        __COMMIT_SHA__: JSON.stringify(getCommitSha()),
    },
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
                                accept: [
                                    "audio/*",
                                    "video/*",
                                    "audio/mpeg",
                                    "audio/mp3",
                                    "audio/wav",
                                    "audio/ogg",
                                    "audio/m4a",
                                    "video/mp4",
                                    "video/webm",
                                    "video/avi",
                                    "video/mov"
                                ]
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