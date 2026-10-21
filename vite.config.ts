import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sites } from './scripts/vite/sites-vite-plugin'

export default defineConfig({
  plugins: [react(), sites({ mockAuth: true })],
  server: { port: 5173, strictPort: true, proxy: {
    '/api/community': { target: 'http://127.0.0.1:8787', changeOrigin: true,
      configure: proxy => proxy.on('proxyReq', (forwarded, request) => {
        if (request.headers.origin === `http://${request.headers.host}`) forwarded.setHeader('Origin', 'http://127.0.0.1:8787')
      }),
    },
  } },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist/client', chunkSizeWarningLimit: 600 },
})
