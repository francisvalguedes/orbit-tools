import { Select, type SelectProps } from '@mantine/core'
import type { Site } from '../api/types'
import { useAllSites } from './store'

interface Props extends Omit<SelectProps, 'data' | 'value' | 'onChange'> {
  value: Site | null
  onChange: (site: Site | null) => void
}

/** Seleção de um local: os do servidor e os do usuário, em grupos. */
export function SiteSelect({ value, onChange, ...props }: Props) {
  const { sites, serverLabel } = useAllSites()
  const groups = [
    { group: serverLabel, items: sites.filter((s) => s.origin === 'servidor').map((s) => s.name) },
    { group: 'Meus locais', items: sites.filter((s) => s.origin === 'usuario').map((s) => s.name) },
  ].filter((g) => g.items.length > 0)
  return (
    <Select
      {...props}
      data={groups}
      value={value?.name ?? null}
      onChange={(name) => {
        const s = sites.find((x) => x.name === name)
        onChange(s ? { name: s.name, lat: s.lat, lon: s.lon, height: s.height } : null)
      }}
      searchable
      nothingFoundMessage="Nenhum local"
    />
  )
}
