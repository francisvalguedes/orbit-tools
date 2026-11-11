// Gráficos da órbita, carregados sob demanda (React.lazy): trazem o Plotly.
import { useComputedColorScheme } from '@mantine/core'
import type { Data, Layout } from 'plotly.js'
import { useMemo } from 'react'
import type { EphemerisResponse, Series } from '../../api/types'
import { themedAxes } from '../../charts/layout'
import { Plot } from '../../charts/Plot'
import { categorical } from '../../charts/tokens'

export default function OrbitCharts({ eph }: { eph: EphemerisResponse }) {
  const scheme = useComputedColorScheme('dark')
  const hasSite = eph.el != null
  const rows: [string, Series][] = [
    ['Altura (km)', eph.height.map((v) => (v == null ? null : v / 1000))],
    ['Latitude (°)', eph.lat],
    ...(hasSite
      ? ([
          ['Elevação no local (°)', eph.el!],
          ['Distância ao local (km)', eph.range!.map((v) => (v == null ? null : v / 1000))],
        ] as [string, Series][])
      : []),
  ]
  const x = useMemo(() => eph.time.map((t) => t.replace('T', ' ')), [eph])

  const data = useMemo<Data[]>(
    () =>
      rows.map(([name, y], k) => ({
        type: 'scattergl',
        mode: 'lines',
        x,
        y,
        name,
        xaxis: k === 0 ? 'x' : `x${k + 1}`,
        yaxis: k === 0 ? 'y' : `y${k + 1}`,
        line: { color: categorical[scheme][k], width: 1.5 },
        hovertemplate: `%{y:.3f}<extra>${name}</extra>`,
      })),
    // rows depende só de eph
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eph, x, scheme],
  )

  const layout = useMemo<Partial<Layout>>(() => {
    const axes = themedAxes(scheme, rows.length) as Record<string, Record<string, unknown>>
    rows.forEach(([name], k) => {
      const sfx = k === 0 ? '' : String(k + 1)
      axes[`yaxis${sfx}`] = { ...axes[`yaxis${sfx}`], title: { text: name } }
      axes[`xaxis${sfx}`] = { ...axes[`xaxis${sfx}`], type: 'date', matches: 'x' }
    })
    if (hasSite) {
      const sfx = '3'
      // linha do horizonte na elevação
      return {
        ...axes,
        grid: { rows: rows.length, columns: 1, pattern: 'independent' },
        showlegend: false,
        hovermode: 'x unified',
        shapes: [
          { type: 'line', xref: 'paper', yref: `y${sfx}`, x0: 0, x1: 1, y0: 0, y1: 0, line: { dash: 'dash', width: 1, color: '#898781' } },
        ],
      } as Partial<Layout>
    }
    return { ...axes, grid: { rows: rows.length, columns: 1, pattern: 'independent' }, showlegend: false, hovermode: 'x unified' } as Partial<Layout>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, hasSite, rows.length])

  return <Plot data={data} layout={layout} height={170 * rows.length + 60} />
}
