// Copiado de trajetory-analysis/frontend/src/theme.ts (commit ceb084d, 10/11/2026).

import { createTheme, type MantineColorsTuple } from '@mantine/core'

// Rampa azul sequencial (100 → 550) da paleta de visualização: mesma família dos gráficos
const blue: MantineColorsTuple = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec',
  '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab',
]

// Escala escura: tinta primária → plano da página. dark[7] é o fundo do corpo, dark[6] o de cards
const dark: MantineColorsTuple = [
  '#f0efec', '#c3c2b7', '#898781', '#5c5b57', '#383835',
  '#2c2c2a', '#20201f', '#1a1a19', '#131312', '#0d0d0d',
]

export const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: { light: 7, dark: 6 },
  colors: { blue, dark },
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  headings: { fontWeight: '600' },
  defaultRadius: 'md',
  cursorType: 'pointer',
})
