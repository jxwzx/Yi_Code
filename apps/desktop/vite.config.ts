import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'spa-index-fallback',
      configureServer(server) {
        // Ensure "/" returns index.html (workaround for strict 404 in some envs)
        server.middlewares.use('/', (req, _res, next) => {
          if (req.url === '/' || req.url === '') {
            req.url = '/index.html'
          }
          next()
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use('/', (req, _res, next) => {
          if (req.url === '/' || req.url === '') {
            req.url = '/index.html'
          }
          next()
        })
      },
    },
  ],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: '../dist',
  },
})
