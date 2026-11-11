// Copiado de trajetory-analysis/frontend/src/charts/layout.ts (commit ceb084d, 10/11/2026).
import type { Layout } from 'plotly.js'
import { chrome, type Scheme } from './tokens'

/** Layout base: superfície transparente, grade recessiva e cursor em cruz no eixo X. */
export function baseLayout(scheme: Scheme): Partial<Layout> {
  const c = chrome[scheme]
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: c.inkSecondary, size: 12 },
    margin: { l: 64, r: 16, t: 36, b: 48 },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink } },
    legend: { orientation: 'h', x: 0, y: 1.08, font: { color: c.inkSecondary } },
    xaxis: axisStyle(scheme),
    yaxis: axisStyle(scheme),
  }
}

export function axisStyle(scheme: Scheme) {
  const c = chrome[scheme]
  return {
    gridcolor: c.grid,
    gridwidth: 1,
    linecolor: c.axis,
    zerolinecolor: c.axis,
    tickfont: { color: c.muted, size: 11 },
    title: { font: { color: c.inkSecondary, size: 12 } },
    showspikes: true,
    spikemode: 'across' as const,
    spikethickness: 1,
    spikecolor: c.muted,
    spikedash: 'solid',
  }
}

/** Estilo de eixo para xaxisN / yaxisN de um layout com subplots. */
export function themedAxes(scheme: Scheme, count: number): Partial<Layout> {
  const out: Record<string, unknown> = {}
  for (let i = 1; i <= count; i++) {
    const suffix = i === 1 ? '' : String(i)
    out[`xaxis${suffix}`] = axisStyle(scheme)
    out[`yaxis${suffix}`] = axisStyle(scheme)
  }
  return out as Partial<Layout>
}
