// Gráficos de posição, velocidade e aceleração, carregados sob demanda (React.lazy): trazem o Plotly.
import { useComputedColorScheme } from '@mantine/core'
import type { Data, Layout } from 'plotly.js'
import { useMemo } from 'react'
import type { KinematicsResponse, Series } from '../../api/types'
import { themedAxes } from '../../charts/layout'
import { Plot } from '../../charts/Plot'
import { categorical } from '../../charts/tokens'

export type Group = 'aer' | 'enu'

const ROWS: Record<Group, { label: string; unit: string; keys: [keyof KinematicsResponse, keyof KinematicsResponse, keyof KinematicsResponse] }[]> = {
  aer: [
    { label: 'Azimute', unit: '°', keys: ['az', 'v_az', 'a_az'] },
    { label: 'Elevação', unit: '°', keys: ['el', 'v_el', 'a_el'] },
    { label: 'Distância', unit: 'm', keys: ['range', 'v_range', 'a_range'] },
  ],
  enu: [
    { label: 'E (x)', unit: 'm', keys: ['e', 've', 'ae'] },
    { label: 'N (y)', unit: 'm', keys: ['n', 'vn', 'an'] },
    { label: 'U (z)', unit: 'm', keys: ['u', 'vu', 'au'] },
  ],
}
const COLS = ['Posição', 'Velocidade', 'Aceleração']

/** Azimute em [0, 360): interrompe a linha na passagem por 0/360 em vez de traçar o salto vertical. */
function breakAtWrap(az: Series): Series {
  return az.map((v, i) => {
    const prev = az[i - 1]
    return v != null && prev != null && Math.abs(v - prev) > 180 ? null : v
  })
}

export default function KinematicsCharts({ data, group }: { data: KinematicsResponse; group: Group }) {
  const scheme = useComputedColorScheme('dark')
  const rows = ROWS[group]

  const traces = useMemo<Data[]>(
    () =>
      rows.flatMap((row, r) =>
        row.keys.map((key, c) => {
          const k = r * 3 + c + 1
          const y = key === 'az' ? breakAtWrap(data.az) : (data[key] as Series)
          return {
            type: 'scattergl',
            mode: 'lines',
            x: data.t,
            y,
            name: `${row.label} · ${COLS[c].toLowerCase()}`,
            line: { color: categorical[scheme][c], width: 1.5 },
            xaxis: k === 1 ? 'x' : `x${k}`,
            yaxis: k === 1 ? 'y' : `y${k}`,
            showlegend: false,
            hovertemplate: '%{y:.6g}<extra></extra>',
          } as Data
        }),
      ),
    [data, rows, scheme],
  )

  const layout = useMemo<Partial<Layout>>(() => {
    const axes = themedAxes(scheme, 9) as Record<string, Record<string, unknown>>
    rows.forEach((row, r) =>
      COLS.forEach((_, c) => {
        const k = r * 3 + c + 1
        const sfx = k === 1 ? '' : String(k)
        const power = ['', '/s', '/s²'][c]
        axes[`yaxis${sfx}`] = { ...axes[`yaxis${sfx}`], title: { text: `${row.label} (${row.unit}${power})` } }
        if (r === 2) axes[`xaxis${sfx}`] = { ...axes[`xaxis${sfx}`], title: { text: 'Tempo (s)' } }
      }),
    )
    return {
      ...axes,
      grid: { rows: 3, columns: 3, pattern: 'independent' },
      hovermode: 'closest',
      margin: { l: 72, r: 16, t: 40, b: 48 },
      annotations: COLS.map((text, c) => ({
        text,
        xref: 'paper',
        yref: 'paper',
        x: c / 3 + 1 / 6,
        y: 1,
        yanchor: 'bottom',
        yshift: 8,
        showarrow: false,
        font: { size: 13 },
      })),
    } as Partial<Layout>
  }, [rows, scheme])

  return <Plot data={traces} layout={layout} height={720} />
}
