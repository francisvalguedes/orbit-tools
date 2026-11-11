import type { ElementRecord } from '../api/types'

const publication = (r: ElementRecord) => `${r.EPOCH ?? ''}|${r.CREATION_DATE ?? ''}|${String(r.GP_ID ?? '').padStart(12, '0')}`

/**
 * O elemento mais recente de cada objeto: maior época e, na mesma época (republicação do
 * Space-Track), a publicação mais nova. Ordem: NORAD decrescente, como a tabela de elementos.
 */
export function latestPerObject(records: ElementRecord[]): ElementRecord[] {
  const best = new Map<number, ElementRecord>()
  for (const r of records) {
    const norad = Number(r.NORAD_CAT_ID)
    const cur = best.get(norad)
    if (!cur || publication(r) > publication(cur)) best.set(norad, r)
  }
  return [...best.values()].sort((a, b) => Number(b.NORAD_CAT_ID) - Number(a.NORAD_CAT_ID))
}
