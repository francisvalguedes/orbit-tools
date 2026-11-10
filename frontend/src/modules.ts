import { useCallback, useSyncExternalStore } from 'react'

export const MODULES = [
  { id: 'elementos', label: 'Elementos' },
  { id: 'passagens', label: 'Passagens' },
  { id: 'orbita', label: 'Órbita' },
  { id: 'conversoes', label: 'Conversões' },
] as const

export type ModuleId = (typeof MODULES)[number]['id']

const DEFAULT: ModuleId = 'elementos'
const PARAM = 'm'

function read(): ModuleId {
  const value = new URLSearchParams(window.location.search).get(PARAM)
  return MODULES.some((m) => m.id === value) ? (value as ModuleId) : DEFAULT
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

/** Módulo atual, guardado na URL (?m=...) para recarregar e compartilhar o link. */
export function useModule(): [ModuleId, (id: ModuleId) => void] {
  const current = useSyncExternalStore(subscribe, read)
  const set = useCallback((id: ModuleId) => {
    const url = new URL(window.location.href)
    url.searchParams.set(PARAM, id)
    window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])
  return [current, set]
}
