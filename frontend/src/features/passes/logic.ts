// Seleção de passagens: regras, conflitos no tempo e referências para gerar os arquivos.
import type { PassRef, PassRow } from '../../api/types'

export const passId = (p: PassRow) => `${p.NORAD_CAT_ID}|${p.H0}`

export const h0Ms = (p: PassRow) => Date.parse(`${p.H0}Z`)
export const hfMs = (p: PassRow) => h0Ms(p) + p.END_PT * 1000

// --- Regras -----------------------------------------------------------------------------------------

export interface Rules {
  minMaxEl: number | null // elevação máxima da passagem ≥ (°)
  h0From: string // HH:MM UTC ('' = sem limite)
  h0To: string
  minDuration: number | null // s
  minMargin: number | null // dB (só com radar)
  minDetectable: number | null // s detectáveis (só com radar)
  maxAge: number | null // idade dos elementos em H0 (dias)
  maxAzRate: number | null // °/s
  types: string[] // OBJECT_TYPE; vazio = todos
  excludeDecayed: boolean
  excludePartial: boolean
  excludeError: boolean
}

export const DEFAULT_RULES: Rules = {
  minMaxEl: 10,
  h0From: '',
  h0To: '',
  minDuration: 90, // o app antigo marcava em vermelho passagens com menos de 90 pontos a 1 Hz
  minMargin: 0,
  minDetectable: null,
  maxAge: 3,
  maxAzRate: null,
  types: [],
  excludeDecayed: true,
  excludePartial: true,
  excludeError: true,
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** A passagem atende a todas as regras preenchidas? */
export function matches(p: PassRow, r: Rules, hasRadar: boolean): boolean {
  if (r.minMaxEl != null && p.MAX_EL < r.minMaxEl) return false
  if (r.h0From && r.h0To) {
    const t = minutes(p.H0_H.slice(0, 5))
    const [a, b] = [minutes(r.h0From), minutes(r.h0To)]
    const inside = a <= b ? t >= a && t <= b : t >= a || t <= b // janela pode passar da meia-noite
    if (!inside) return false
  }
  if (r.minDuration != null && p.DURATION < r.minDuration) return false
  if (hasRadar && r.minMargin != null && (p.MAX_MARGIN_DB == null || p.MAX_MARGIN_DB < r.minMargin)) return false
  if (hasRadar && r.minDetectable != null && (p.DETECTABLE_S ?? 0) < r.minDetectable) return false
  if (r.maxAge != null && Math.abs(p.EPOCH_AGE) > r.maxAge) return false
  if (r.maxAzRate != null && (p.MAX_AZ_RATE ?? 0) > r.maxAzRate) return false
  if (r.types.length && !r.types.includes(String(p.OBJECT_TYPE ?? 'UNK'))) return false
  if (r.excludeDecayed && p.DECAY_DATE) return false
  if (r.excludePartial && p.PARTIAL) return false
  if (r.excludeError && p.SGP4_ERROR) return false
  return true
}

// --- Conflitos ----------------------------------------------------------------------------------------

/**
 * Passagens selecionadas que se sobrepõem no tempo (um sensor rastreia um objeto por vez).
 * `gapS`: intervalo mínimo entre o fim de uma e o início da seguinte, para reposicionar a antena.
 */
export function conflicts(selected: PassRow[], gapS = 0): Set<string> {
  const sorted = [...selected].sort((a, b) => h0Ms(a) - h0Ms(b))
  const out = new Set<string>()
  let lastEnd = -Infinity
  let lastId: string | null = null
  for (const p of sorted) {
    if (h0Ms(p) < lastEnd + gapS * 1000) {
      out.add(passId(p))
      if (lastId) out.add(lastId)
    }
    if (hfMs(p) > lastEnd) {
      lastEnd = hfMs(p)
      lastId = passId(p)
    }
  }
  return out
}

export type Priority = 'margin' | 'el' | 'rcs' | 'duration'

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'margin', label: 'Margem de detecção' },
  { value: 'el', label: 'Elevação máxima' },
  { value: 'rcs', label: 'RCS' },
  { value: 'duration', label: 'Duração' },
]

function score(p: PassRow, priority: Priority): number {
  switch (priority) {
    case 'margin':
      return p.MAX_MARGIN_DB ?? p.MAX_EL - 1e6 // sem radar: cai para a elevação
    case 'el':
      return p.MAX_EL
    case 'rcs':
      return p.RCS_USED ?? -1
    case 'duration':
      return p.DURATION
  }
}

/** Mantém, entre as selecionadas, as de maior prioridade que não se sobrepõem (guloso). */
export function resolveConflicts(selected: PassRow[], priority: Priority, gapS = 0): Set<string> {
  const kept: PassRow[] = []
  const ranked = [...selected].sort((a, b) => score(b, priority) - score(a, priority))
  for (const p of ranked) {
    const ok = kept.every((k) => hfMs(p) + gapS * 1000 <= h0Ms(k) || hfMs(k) + gapS * 1000 <= h0Ms(p))
    if (ok) kept.push(p)
  }
  return new Set(kept.map(passId))
}

// --- Geração ---------------------------------------------------------------------------------------

/**
 * Referência para gerar a trajetória: a passagem inteira ou só o trecho detectável pelo radar.
 * H0 continua em segundo inteiro (as amostras do resumo são de 1 s), como o nome do arquivo exige.
 */
export function passRef(p: PassRow, onlyDetectable: boolean): PassRef {
  if (onlyDetectable && p.DET_START_PT != null && p.DET_END_PT != null) {
    const h0 = new Date(h0Ms(p) + p.DET_START_PT * 1000).toISOString().slice(0, 23)
    return { norad: p.NORAD_CAT_ID, epoch: p.EPOCH, h0, end_pt: p.DET_END_PT - p.DET_START_PT }
  }
  return { norad: p.NORAD_CAT_ID, epoch: p.EPOCH, h0: p.H0, end_pt: p.END_PT }
}
