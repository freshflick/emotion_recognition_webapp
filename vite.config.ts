import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const backend = env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'

    return {
        plugins: [
            react(),
            tailwindcss(),
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './frontend/src'),
            },
        },
        base: '/',
        server: {
            // Proxying means the browser only ever talks to the Vite origin, so
            // there is no CORS involved in dev and API paths stay relative —
            // the same relative paths then work in production, where FastAPI
            // serves the built frontend from its own origin.
            proxy: {
                '/api': {
                    target: backend,
                    changeOrigin: true,
                },
                '/ws': {
                    target: backend,
                    ws: true,
                    changeOrigin: true,
                },
            },
        },
    }
})
