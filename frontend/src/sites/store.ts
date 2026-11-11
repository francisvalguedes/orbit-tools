import { useLocalStorage } from '@mantine/hooks'
import { useMemo } from 'react'
import { useMeta } from '../api/client'
import type { Site } from '../api/types'
import { readCsvFile, toCsv, toNumber } from '../lib/csv'

const KEY = 'orbit-tools:sites'

export interface SiteOption extends Site {
  origin: 'servidor' | 'usuario'
}

/** Locais cadastrados pelo usuário, guardados só neste navegador. */
export function useUserSites() {
  return useLocalStorage<Site[]>({ key: KEY, defaultValue: [], getInitialValueInEffect: false })
}

/** Locais do servidor (exemplos ou os da instalação) seguidos dos do usuário. */
export function useAllSites(): { sites: SiteOption[]; serverLabel: string } {
  const meta = useMeta()
  const [user] = useUserSites()
  return useMemo(() => {
    const server = (meta.data?.sites ?? []).map((s) => ({ ...s, origin: 'servidor' as const }))
    const names = new Set(server.map((s) => s.name))
    const mine = user.filter((s) => !names.has(s.name)).map((s) => ({ ...s, origin: 'usuario' as const }))
    const label = meta.data?.sites_source === 'exemplos' ? 'Exemplos (fictícios)' : 'Locais da instalação'
    return { sites: [...server, ...mine], serverLabel: label }
  }, [meta.data, user])
}

export function validateSite(s: Partial<Site>): string | null {
  if (!s.name || !s.name.trim()) return 'Informe o nome.'
  if (s.lat == null || !Number.isFinite(s.lat) || Math.abs(s.lat) > 90) return 'Latitude entre −90 e 90.'
  if (s.lon == null || !Number.isFinite(s.lon) || s.lon < -180 || s.lon > 360) return 'Longitude entre −180 e 360.'
  if (s.height == null || !Number.isFinite(s.height)) return 'Informe a altura.'
  return null
}

/** CSV no formato do confLocalWGS84.csv dos apps antigos: name, lat, lon, height (color é ignorada). */
export async function sitesFromCsv(file: File): Promise<Site[]> {
  const { columns, rows } = await readCsvFile(file)
  for (const c of ['name', 'lat', 'lon', 'height']) {
    if (!columns.includes(c)) throw new Error(`Coluna obrigatória ausente: ${c} (esperado: name, lat, lon, height).`)
  }
  return rows.map((r, i) => {
    const site = { name: r.name?.trim() ?? '', lat: toNumber(r.lat), lon: toNumber(r.lon), height: toNumber(r.height) }
    const err = validateSite(site)
    if (err) throw new Error(`Linha ${i + 2}: ${err}`)
    return site
  })
}

export function sitesToCsv(sites: Site[]): string {
  return toCsv(
    ['name', 'lat', 'lon', 'height'],
    sites.map((s) => [s.name, s.lat, s.lon, s.height]),
  )
}
