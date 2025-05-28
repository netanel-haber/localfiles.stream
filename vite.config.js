import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import git from 'git-rev-sync';

// Safely get git info with fallbacks
function getGitInfo() {
    try {
        return {
            sha: git.short(),
            buildTime: new Date().toISOString()
        };
    } catch (error) {
        console.warn('Git not available, using fallback values');
        return {
            sha: 'dev',
            buildTime: new Date().toISOString()
        };
    }
}

const gitInfo = getGitInfo();

export default defineConfig({
    define: {
        __COMMIT_SHA__: JSON.stringify(gitInfo.sha),
        __BUILD_TIME__: JSON.stringify(gitInfo.buildTime),
    },
    server: {
        port: 5173,
        strictPort: false,
        https: true,
        hmr: {
            protocol: 'wss',
            host: 'localhost',
            port: 5173,
        },
    },
    plugins: [
        basicSsl(),
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