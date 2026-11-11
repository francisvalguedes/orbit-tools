// Erro entre conjuntos sucessivos de um objeto, carregado sob demanda (React.lazy): traz o Plotly.
import { useComputedColorScheme } from '@mantine/core'
import type { Data, Layout } from 'plotly.js'
import { useMemo } from 'react'
import type { CompareRow } from '../../api/types'
import { axisStyle } from '../../charts/layout'
import { Plot } from '../../charts/Plot'
import { categorical } from '../../charts/tokens'

export default function CompareChart({ rows }: { rows: CompareRow[] }) {
  const scheme = useComputedColorScheme('dark')
  const sorted = useMemo(() => [...rows].sort((a, b) => a.EPOCH.localeCompare(b.EPOCH)), [rows])
  const data = useMemo<Data[]>(() => {
    const x = sorted.map((r) => r.EPOCH.replace('T', ' ').slice(0, 19))
    const series: [keyof CompareRow, string][] = [
      ['D_ERR_MAX', 'Erro máximo'],
      ['D_ERR_MEAN', 'Erro médio'],
      ['I_ERR_MEAN', 'Ao longo da órbita (médio)'],
      ['R_ERR_MEAN', 'Radial (médio)'],
      ['C_ERR_MEAN', 'Através da órbita (médio)'],
    ]
    return series.map(([key, name], k) => ({
      type: 'scatter',
      mode: 'lines+markers',
      x,
      y: sorted.map((r) => (r[key] as number | null) ?? null),
      name,
      line: { color: categorical[scheme][k], width: k < 2 ? 2 : 1.25, dash: k < 2 ? 'solid' : 'dot' },
      hovertemplate: '%{y:.0f} m<extra>%{fullData.name}</extra>',
    }))
  }, [sorted, scheme])
  const layout = useMemo<Partial<Layout>>(
    () => ({
      yaxis: { ...axisStyle(scheme), title: { text: 'Erro (m)' }, rangemode: 'tozero' },
      xaxis: { ...axisStyle(scheme), title: { text: 'Época do conjunto mais novo (UTC)' } },
      shapes: [
        { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 3000, y1: 3000, line: { dash: 'dash', width: 1, color: '#898781' } },
      ],
    }),
    [scheme],
  )
  return <Plot data={data} layout={layout} height={380} />
}
