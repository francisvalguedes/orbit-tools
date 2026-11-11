// Linha do tempo das passagens, carregada sob demanda (React.lazy): traz o Plotly.
// Uma barra por passagem; clicar seleciona ou desmarca. Conflitos (sobreposição) em vermelho.
import { useComputedColorScheme } from '@mantine/core'
import type { Data, Layout, PlotMouseEvent } from 'plotly.js'
import { useMemo } from 'react'
import type { PassRow } from '../../api/types'
import { axisStyle } from '../../charts/layout'
import { Plot } from '../../charts/Plot'
import { categorical, chrome, status } from '../../charts/tokens'
import { passId } from './logic'

interface Props {
  passes: PassRow[]
  selected: Set<string>
  conflicts: Set<string>
  onToggle: (id: string) => void
}

const label = (p: PassRow) => `${p.NORAD_CAT_ID} ${p.OBJECT_NAME ?? ''}`.trim()

export default function TimelineChart({ passes, selected, conflicts, onToggle }: Props) {
  const scheme = useComputedColorScheme('dark')
  const objects = useMemo(() => [...new Set(passes.map(label))], [passes])

  const data = useMemo<Data[]>(() => {
    const groups: { name: string; color: string; filter: (id: string) => boolean }[] = [
      { name: 'Não selecionada', color: chrome[scheme].axis, filter: (id) => !selected.has(id) },
      { name: 'Selecionada', color: categorical[scheme][0], filter: (id) => selected.has(id) && !conflicts.has(id) },
      { name: 'Em conflito', color: status.critical, filter: (id) => conflicts.has(id) },
    ]
    return groups.map((g) => {
      const rows = passes.filter((p) => g.filter(passId(p)))
      return {
        type: 'bar',
        orientation: 'h',
        name: g.name,
        y: rows.map(label),
        x: rows.map((p) => p.END_PT * 1000), // duração em ms (eixo de datas)
        base: rows.map((p) => p.H0.replace('T', ' ')),
        customdata: rows.map(passId),
        marker: { color: g.color, line: { width: 0 } },
        hovertemplate: rows.map(
          (p) =>
            `<b>${label(p)}</b><br>H0 ${p.H0_H} · ${p.DURATION} s<br>El. máx ${p.MAX_EL.toFixed(1)}°` +
            (p.MAX_MARGIN_DB != null ? ` · margem ${p.MAX_MARGIN_DB.toFixed(1)} dB` : '') +
            '<extra></extra>',
        ),
      } as Data
    })
  }, [passes, selected, conflicts, scheme])

  const height = Math.min(Math.max(objects.length * 18 + 120, 280), 1600)
  const layout = useMemo<Partial<Layout>>(
    () => ({
      barmode: 'overlay',
      hovermode: 'closest',
      margin: { l: 180, r: 16, t: 36, b: 48 },
      xaxis: { ...axisStyle(scheme), type: 'date', title: { text: 'UTC' } },
      yaxis: { ...axisStyle(scheme), type: 'category', autorange: 'reversed', showspikes: false, tickfont: { size: 10 } },
    }),
    [scheme],
  )

  return (
    <Plot
      data={data}
      layout={layout}
      height={height}
      onClick={(e: PlotMouseEvent) => {
        const id = e.points[0]?.customdata as string | undefined
        if (id) onToggle(id)
      }}
    />
  )
}
