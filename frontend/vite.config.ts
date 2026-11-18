import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Arquivos estáticos do Cesium (workers, texturas, widgets), servidos em /cesium.
// A URL é informada ao Cesium em src/main.tsx (CESIUM_BASE_URL).
const cesiumSource = 'node_modules/cesium/Build/Cesium'

const backend = 'http://127.0.0.1:8000'

// Commit do build, mostrado no selo da versão: GIT_COMMIT (imagem Docker, sem a pasta .git), GITHUB_SHA
// (GitHub Actions) ou o git local; sem nenhum, fica vazio e o selo mostra só a versão.
function buildCommit(): string {
  const env = process.env.GIT_COMMIT || process.env.GITHUB_SHA
  if (env) return env
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

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
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
