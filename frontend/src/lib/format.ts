// Copiado de trajetory-analysis/frontend/src/lib/format.ts (commit ceb084d, 10/11/2026).

const NARROW_NBSP = ' '

/** Número com espaço fino nos milhares e ponto decimal (ex.: 416 174.5). */
export function fmtNum(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value
    .toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replaceAll(',', NARROW_NBSP)
}

/** Distância/altura: metros abaixo de 10 km, km acima. */
export function fmtLength(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  return Math.abs(m) >= 10_000 ? `${fmtNum(m / 1000, 1)} km` : `${fmtNum(m, 0)} m`
}

export function fmtTime(s: number): string {
  return `${fmtNum(s, s % 1 === 0 ? 0 : 2)} s`
}

export function fmtDeg(v: number | null | undefined, digits = 2): string {
  return v == null ? '—' : `${fmtNum(v, digits)}°`
}

// Acréscimo do orbit-tools

/** "1 conjunto", "2 conjuntos" (número com espaço fino nos milhares). */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${fmtNum(n)} ${n === 1 ? singular : pluralForm}`
}
