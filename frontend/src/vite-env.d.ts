/// <reference types="vite/client" />

// Definidos em vite.config.ts no momento do build
declare const __BUILD_COMMIT__: string // hash completo, ou vazio
declare const __BUILD_TIME__: string // ISO, UTC

declare module 'plotly.js-dist-min' {
  import * as Plotly from 'plotly.js'
  export default Plotly
}
