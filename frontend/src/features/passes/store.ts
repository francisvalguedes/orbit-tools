// Resultado da última busca e a seleção, guardados no IndexedDB para sobreviver à troca de módulo
// e ao recarregar a página.
import { get, set as idbSet } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { Radar, SearchResult, Site } from '../../api/types'

const KEY = 'orbit-tools:passes'

export interface PassesState {
  result: SearchResult
  site: Site
  radar: Radar | null
  set_id: string // conjunto de elementos usado na busca
  selected: string[] // passId
  focus: string | null // passagem aberta no detalhe
  searched_at: string
}

let state: PassesState | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// Dados de outra versão ou corrompidos são ignorados: quebrariam a página a cada abertura
const valid = (v: PassesState | undefined): v is PassesState =>
  v != null &&
  Array.isArray(v.result?.passes) &&
  typeof v.set_id === 'string' &&
  Array.isArray(v.selected) &&
  v.site != null

void get<PassesState>(KEY)
  .then((v) => {
    if (valid(v) && !state) {
      state = v
      emit()
    }
  })
  .catch(() => undefined)

export function setPassesState(next: PassesState | null) {
  state = next
  emit()
  void idbSet(KEY, next).catch(() => undefined)
}

export function updatePasses(patch: Partial<PassesState>) {
  if (state) setPassesState({ ...state, ...patch })
}

export function usePassesState(): PassesState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
