import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
var gitSha = 'dev';
try {
    gitSha = execSync('git rev-parse --short HEAD').toString().trim();
}
catch (_a) {
    gitSha = 'dev';
}
var buildTime = new Date().toISOString();
export default defineConfig({
    define: {
        __GIT_SHA__: JSON.stringify(gitSha),
        __BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['pwa-192.png', 'pwa-512.png'],
            manifest: {
                name: 'Mecflux Personal OS',
                short_name: 'Mecflux',
                start_url: '/',
                display: 'standalone',
                theme_color: '#2196f3',
                background_color: '#f5f7fb',
                icons: [
                    {
                        src: '/pwa-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/pwa-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,json,woff2}'],
                navigateFallback: '/index.html',
                maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
            },
        }),
    ],
});
