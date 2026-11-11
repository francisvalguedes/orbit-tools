import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Arquivos estáticos do Cesium (workers, texturas, widgets), servidos em /cesium.
// A URL é informada ao Cesium em src/main.tsx (CESIUM_BASE_URL).
const cesiumSource = 'node_modules/cesium/Build/Cesium'

const backend = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
        src: `${cesiumSource}/${dir}`,
        dest: 'cesium',
        rename: { stripBase: 4 }, // remove node_modules/cesium/Build/Cesium/
      })),
    }),
  ],
  server: {
    proxy: {
      '/api': backend,
      '/docs': backend,
      '/openapi.json': backend,
    },
  },
  build: {
    chunkSizeWarningLimit: 6000, // Cesium e Plotly são grandes; já carregados sob demanda
  },
})
