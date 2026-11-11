// Conjunto de elementos atual, compartilhado pelos módulos e guardado no IndexedDB deste navegador
// (um catálogo grande passa do limite do localStorage).
import { get, set as idbSet } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { api } from '../api/client'
import type { ElementRecord, ElementSet } from '../api/types'

const KEY = 'orbit-tools:elements'

export interface CurrentSet {
  set_id: string
  records: ElementRecord[]
  sources: string[]
  loaded_at: string // ISO
  warnings: string[]
  not_found: string[]
  decayed: number[]
}

let state: CurrentSet | null = null
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

const ready = get<CurrentSet>(KEY)
  .then((v) => {
    if (v && !state) state = v
  })
  .catch(() => undefined) // navegação privada ou IndexedDB bloqueado: só fica na memória
  .finally(() => {
    loaded = true
    emit()
  })

function save(next: CurrentSet | null) {
  state = next
  emit()
  void idbSet(KEY, next).catch(() => undefined)
}

export function useElementSet(): { current: CurrentSet | null; loaded: boolean } {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  const isLoaded = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => loaded,
  )
  return { current, loaded: isLoaded }
}

const keyOf = (r: ElementRecord) => `${r.NORAD_CAT_ID}|${r.EPOCH}`

/** Troca o conjunto atual pelo recebido, ou junta os dois (sem repetir NORAD + época). */
export async function applyElementSet(result: ElementSet, merge: boolean): Promise<CurrentSet> {
  await ready
  const base: CurrentSet = {
    set_id: result.set_id,
    records: result.records,
    sources: [result.source],
    loaded_at: new Date().toISOString(),
    warnings: result.warnings,
    not_found: result.not_found,
    decayed: result.decayed,
  }
  if (!merge || !state) {
    save(base)
    return base
  }
  const seen = new Set(state.records.map(keyOf))
  const records = [...state.records, ...result.records.filter((r) => !seen.has(keyOf(r)))]
  records.sort(
    (a, b) => Number(b.NORAD_CAT_ID) - Number(a.NORAD_CAT_ID) || String(b.EPOCH).localeCompare(String(a.EPOCH)),
  )
  const { set_id } = await api.elements.store(records)
  const merged: CurrentSet = {
    set_id,
    records,
    sources: [...state.sources, result.source],
    loaded_at: base.loaded_at,
    warnings: [...state.warnings, ...result.warnings],
    not_found: [...new Set([...state.not_found, ...result.not_found])],
    decayed: [...new Set([...state.decayed, ...result.decayed])],
  }
  save(merged)
  return merged
}

/** O servidor descartou o conjunto e ele foi reenviado com outro id (o conteúdo é o mesmo). */
export function updateSetId(setId: string) {
  if (state && state.set_id !== setId) save({ ...state, set_id: setId })
}

export function clearElementSet() {
  save(null)
}
