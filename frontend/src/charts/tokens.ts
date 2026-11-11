// Copiado de trajetory-analysis/frontend/src/charts/tokens.ts (commit ceb084d, 10/11/2026).
// Tokens de visualização (paleta validada da skill dataviz, modos claro e escuro).
// Ordem categórica fixa: a cor segue a entidade, nunca a posição.

export type Scheme = 'light' | 'dark'

export const categorical: Record<Scheme, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

export const status = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

export const chrome: Record<
  Scheme,
  { surface: string; page: string; ink: string; inkSecondary: string; muted: string; grid: string; axis: string }
> = {
  light: {
    surface: '#fcfcfb',
    page: '#f9f9f7',
    ink: '#0b0b0b',
    inkSecondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    surface: '#1a1a19',
    page: '#0d0d0d',
    ink: '#f0efec',
    inkSecondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
}
