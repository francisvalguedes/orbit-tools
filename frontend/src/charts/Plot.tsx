// Copiado de trajetory-analysis/frontend/src/charts/Plot.tsx (commit ceb084d, 10/11/2026).
import { useComputedColorScheme } from '@mantine/core'
import type { Config, Data, Layout, PlotlyHTMLElement, PlotMouseEvent, PlotRelayoutEvent } from 'plotly.js'
import Plotly from 'plotly.js-dist-min'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { baseLayout } from './layout'

interface PlotProps {
  data: Data[]
  layout?: Partial<Layout>
  config?: Partial<Config>
  height: number
  onClick?: (e: PlotMouseEvent) => void
  onRelayout?: (e: PlotRelayoutEvent) => void
}

const defaultConfig: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  toImageButtonOptions: { format: 'png', scale: 2 },
}

export function Plot({ data, layout, config, height, onClick, onRelayout }: PlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  const scheme = useComputedColorScheme('dark')
  // handlers em ref: os eventos do Plotly são registrados uma vez e chamam sempre a versão atual
  const handlers = useRef({ onClick, onRelayout })
  useLayoutEffect(() => {
    handlers.current = { onClick, onRelayout }
  })

  const bound = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    void Plotly.react(el, data, { ...baseLayout(scheme), height, ...layout }, { ...defaultConfig, ...config }).then(
      () => {
        // o Plotly só expõe .on depois do primeiro desenho; registra uma vez
        if (bound.current) return
        bound.current = true
        const p = el as unknown as PlotlyHTMLElement
        p.on('plotly_click', (e) => handlers.current.onClick?.(e))
        p.on('plotly_relayout', (e) => handlers.current.onRelayout?.(e))
      },
    )
  }, [data, layout, config, height, scheme])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => Plotly.Plots.resize(el))
    observer.observe(el)
    return () => {
      observer.disconnect()
      Plotly.purge(el) // remove também os eventos
      bound.current = false
    }
  }, [])

  return <div ref={ref} style={{ width: '100%', height }} />
}
