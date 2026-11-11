import Papa from 'papaparse'

export interface Table {
  columns: string[]
  rows: Record<string, string>[]
}

/** Lê um CSV com cabeçalho (vírgula, ponto e vírgula ou tabulação; BOM removido). */
export function parseCsvText(text: string): Table {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const fatal = result.errors.find((e) => e.type !== 'FieldMismatch')
  if (fatal) throw new Error(`CSV inválido (linha ${(fatal.row ?? 0) + 2}): ${fatal.message}`)
  const columns = (result.meta.fields ?? []).filter((c) => c !== '')
  if (columns.length === 0) throw new Error('CSV sem cabeçalho.')
  return { columns, rows: result.data }
}

export async function readCsvFile(file: File): Promise<Table> {
  return parseCsvText(await file.text())
}

/** Número de uma célula; aceita vírgula decimal. NaN se vazio ou inválido. */
export function toNumber(value: string | undefined): number {
  if (value == null) return Number.NaN
  const s = value.trim().replace(',', '.')
  return s === '' ? Number.NaN : Number(s)
}

/** Coluna mais provável entre os nomes candidatos (sem diferenciar maiúsculas). */
export function guessColumn(columns: string[], candidates: string[]): string | null {
  const lower = columns.map((c) => c.toLowerCase())
  for (const cand of candidates) {
    const i = lower.indexOf(cand.toLowerCase())
    if (i >= 0) return columns[i]
  }
  return null
}

type Cell = string | number | null | undefined

/** CSV com ponto decimal e células vazias para valores ausentes. */
export function toCsv(columns: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return [columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n'
}

export function download(content: string, fileName: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
