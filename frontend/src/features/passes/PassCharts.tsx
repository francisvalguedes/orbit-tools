// Gráfico polar (céu visto do sensor) e taxas de uma passagem, carregados sob demanda: trazem o Plotly.
import { SimpleGrid, useComputedColorScheme } from '@mantine/core'
import type { Data, Layout } from 'plotly.js'
import { useMemo } from 'react'
import type { TrajectoryResponse } from '../../api/types'
import { axisStyle, themedAxes } from '../../charts/layout'
import { Plot } from '../../charts/Plot'
import { categorical, chrome } from '../../charts/tokens'

export default function PassCharts({ traj, h0 }: { traj: TrajectoryResponse; h0: string }) {
  const scheme = useComputedColorScheme('dark')
  const c = chrome[scheme]
  const color = categorical[scheme][0]

  // Polar: raio = 90° − elevação (zênite no centro), ângulo = azimute a partir do norte, sentido horário
  const polar = useMemo<{ data: Data[]; layout: Partial<Layout> }>(() => {
    const n = traj.t.length
    return {
      data: [
        {
          type: 'scatterpolar',
          mode: 'lines',
          r: traj.el.map((e) => (e == null ? null : 90 - e)),
          theta: traj.az,
          line: { color, width: 2.5 },
          customdata: traj.t,
          hovertemplate: 'Az %{theta:.1f}° · El %{text}° · t = %{customdata:.0f} s<extra></extra>',
          text: traj.el.map((e) => (e == null ? '' : e.toFixed(1))),
          name: 'Passagem',
        },
        {
          type: 'scatterpolar',
          mode: 'markers+text',
          r: [90 - (traj.el[0] ?? 0), 90 - (traj.el[n - 1] ?? 0)],
          theta: [traj.az[0], traj.az[n - 1]],
          text: ['H0', 'fim'],
          textposition: 'top center',
          marker: { size: 8, color: [categorical[scheme][2], categorical[scheme][1]] },
          hoverinfo: 'skip',
          showlegend: false,
        },
      ] as Data[],
      layout: {
        showlegend: false,
        margin: { l: 40, r: 40, t: 40, b: 40 },
        polar: {
          bgcolor: 'rgba(0,0,0,0)',
          angularaxis: { direction: 'clockwise', rotation: 90, gridcolor: c.grid, linecolor: c.axis, tickfont: { color: c.muted } },
          radialaxis: {
            angle: 45, // na diagonal NE, longe dos rótulos de azimute
            tickangle: 45,
            range: [0, 90],
            // Só os anéis intermediários: zênite (centro) e horizonte (borda) são evidentes
            tickvals: [30, 60],
            ticktext: ['El 60°', 'El 30°'],
            gridcolor: c.grid,
            linecolor: c.axis,
            tickfont: { color: c.muted, size: 9 },
          },
        },
      } as Partial<Layout>,
    }
  }, [traj, scheme, c, color])

  const rates = useMemo<{ data: Data[]; layout: Partial<Layout> }>(() => {
    const series: [keyof TrajectoryResponse, string, string][] = [
      ['range', 'Distância (km)', 'y'],
      ['el', 'Elevação (°)', 'y2'],
      ['az_rate', 'Vel. azimute (°/s)', 'y3'],
    ]
    const axes = themedAxes(scheme, 3) as Record<string, Record<string, unknown>>
    return {
      data: series.map(([key, name, yaxis], k) => ({
        type: 'scatter',
        mode: 'lines',
        x: traj.t,
        y: key === 'range' ? traj.range.map((v) => (v == null ? null : v / 1000)) : traj[key],
        name,
        xaxis: k === 0 ? 'x' : `x${k + 1}`,
        yaxis,
        line: { color: categorical[scheme][k], width: 1.75 },
        hovertemplate: `%{y:.3f}<extra>${name}</extra>`,
      })) as Data[],
      layout: {
        ...axes,
        xaxis3: { ...axes.xaxis3, title: { text: `Tempo desde H0 ${h0.slice(11, 19)} UTC (s)` } },
        yaxis: { ...axes.yaxis, title: { text: 'Distância (km)' } },
        yaxis2: { ...axes.yaxis2, title: { text: 'Elevação (°)' } },
        yaxis3: { ...axes.yaxis3, title: { text: 'Vel. az. (°/s)' } },
        grid: { rows: 3, columns: 1, pattern: 'independent' },
        showlegend: false,
        hovermode: 'x unified',
        xaxis: { ...axisStyle(scheme), matches: 'x3' },
        xaxis2: { ...axisStyle(scheme), matches: 'x3' },
      } as Partial<Layout>,
    }
  }, [traj, scheme, h0])

  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      <Plot data={polar.data} layout={polar.layout} height={420} />
      <Plot data={rates.data} layout={rates.layout} height={420} />
    </SimpleGrid>
  )
}
