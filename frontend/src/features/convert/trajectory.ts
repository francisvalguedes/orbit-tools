import { guessColumn, parseCsvText, toNumber } from '../../lib/csv'

export interface Trajectory {
  name: string
  x: number[]
  y: number[]
  z: number[]
}

/**
 * `.trn`: a primeira linha é sempre descartada (cabeçalho ou metadados) e as demais têm x, y, z.
 * Outros arquivos: CSV com cabeçalho e colunas x, y, z (ou E, N, U).
 */
export function parseTrajectory(text: string, name: string): Trajectory {
  const out: Trajectory = { name, x: [], y: [], z: [] }
  if (/\.trn$/i.test(name)) {
    text
      .split(/\r?\n/)
      .slice(1)
      .forEach((line, i) => {
        if (!line.trim()) return
        const v = line.split(/[\s,;]+/).filter(Boolean).map(Number)
        if (v.length < 3 || v.slice(0, 3).some((x) => !Number.isFinite(x))) {
          throw new Error(`Linha ${i + 2}: esperados 3 números (x, y, z).`)
        }
        out.x.push(v[0])
        out.y.push(v[1])
        out.z.push(v[2])
      })
  } else {
    const t = parseCsvText(text)
    const cols = [
      guessColumn(t.columns, ['x', 'e', 'ENU_E']),
      guessColumn(t.columns, ['y', 'n', 'ENU_N']),
      guessColumn(t.columns, ['z', 'u', 'ENU_U']),
    ]
    if (cols.some((c) => !c)) throw new Error('O CSV precisa das colunas x, y, z (ou E, N, U).')
    t.rows.forEach((r, i) => {
      const v = cols.map((c) => toNumber(r[c!]))
      if (v.some((x) => !Number.isFinite(x))) throw new Error(`Linha ${i + 2}: valor não numérico.`)
      out.x.push(v[0])
      out.y.push(v[1])
      out.z.push(v[2])
    })
  }
  if (out.x.length < 3) throw new Error('A trajetória precisa de pelo menos 3 pontos.')
  return out
}

/** Trajetória balística sintética (sem arrasto), só para experimentar a página. */
export function example(): Trajectory {
  const g = 9.80665
  const vx = 300
  const vy = 900
  const vz = 1500
  const x: number[] = []
  const y: number[] = []
  const z: number[] = []
  for (let t = 0; t <= 2 * (vz / g); t += 1) {
    x.push(vx * t)
    y.push(vy * t)
    z.push(vz * t - (g * t * t) / 2)
  }
  return { name: 'exemplo sintético', x, y, z }
}
