import { Alert, Button, Checkbox, Group, NumberInput, Progress, Stack, Text, TextInput } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconPlayerStopFilled, IconSearch } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { api, useMeta, withElementSet } from '../../api/client'
import type { Progress as ProgressInfo, Radar, Site } from '../../api/types'
import { type CurrentSet, updateSetId } from '../../elements/store'
import { fmtNum } from '../../lib/format'
import { RadarSelect, RadarsManager } from '../../sites/radars'
import { SiteSelect } from '../../sites/SiteSelect'
import { SitesManager } from '../../sites/SitesManager'
import { setPassesState } from './store'

interface Params {
  start: string // datetime-local, UTC
  end: string
  dMax: number
  dMin: number
  useMinEl: boolean
  minEl: number
  includePartial: boolean
}

function nextHourUtc(offsetH = 0) {
  const d = new Date()
  d.setUTCMinutes(0, 0, 0)
  d.setUTCHours(d.getUTCHours() + 1 + offsetH)
  return d.toISOString().slice(0, 16)
}

export function SearchPanel({ set }: { set: CurrentSet | null }) {
  const meta = useMeta()
  const [site, setSite] = useLocalStorage<Site | null>({ key: 'orbit-tools:passes-site', defaultValue: null })
  const [radar, setRadar] = useLocalStorage<Radar | null>({ key: 'orbit-tools:passes-radar', defaultValue: null })
  const [params, setParams] = useLocalStorage<Params>({
    key: 'orbit-tools:passes-params',
    defaultValue: { start: '', end: '', dMax: 1100, dMin: 1000, useMinEl: false, minEl: 10, includePartial: false },
  })
  const start = params.start || nextHourUtc()
  const end = params.end || nextHourUtc(24)
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const days = (Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 86400e3
  const objects = set ? new Set(set.records.map((r) => r.NORAD_CAT_ID)).size : 0
  const limits = meta.data?.limits

  const run = async () => {
    if (!set) return setError('Carregue elementos orbitais no módulo Elementos.')
    if (!site) return setError('Escolha o local do sensor.')
    if (!(days > 0)) return setError('O fim da janela deve ser depois do início.')
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setError(null)
    setProgress({ fraction: 0, stage: 'enviando' })
    try {
      let usedSet = set.set_id
      const result = await withElementSet(
        set,
        (setId) => {
          usedSet = setId
          return api.passes.search(
            {
              set_id: setId,
              site,
              start: `${start}:00`,
              end: `${end}:00`,
              d_max_km: params.dMax,
              d_min_km: params.dMin,
              min_el_deg: params.useMinEl ? params.minEl : null,
              include_partial: params.includePartial,
              radar,
            },
            setProgress,
            ctrl.signal,
          )
        },
        updateSetId,
      )
      setPassesState({
        result,
        site,
        radar,
        set_id: usedSet,
        selected: [],
        focus: result.passes[0] ? `${result.passes[0].NORAD_CAT_ID}|${result.passes[0].H0}` : null,
        searched_at: new Date().toISOString(),
      })
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  const set_ = (patch: Partial<Params>) => setParams({ ...params, start, end, ...patch })

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <SiteSelect label="Local do sensor" value={site} onChange={setSite} placeholder="Escolha" style={{ flex: 1 }} />
      </Group>
      <Group gap="xs">
        <SitesManager />
      </Group>
      <TextInput type="datetime-local" label="Início (UTC)" value={start} onChange={(e) => set_({ start: e.currentTarget.value })} />
      <TextInput
        type="datetime-local"
        label="Fim (UTC)"
        value={end}
        onChange={(e) => set_({ end: e.currentTarget.value })}
        description={days > 0 ? `${fmtNum(days, 2)} dias · ${fmtNum(objects)} objetos no conjunto` : undefined}
        error={limits && days > limits.max_search_days ? `Janela de até ${limits.max_search_days} dias` : undefined}
      />
      <Group grow>
        <NumberInput
          label="Distância máx. (km)"
          description="Limites da trajetória"
          value={params.dMax}
          onChange={(v) => set_({ dMax: Number(v) })}
          min={100}
          step={50}
        />
        <NumberInput
          label="Distância mín. (km)"
          description="Para aceitar"
          value={params.dMin}
          onChange={(v) => set_({ dMin: Number(v) })}
          min={100}
          step={50}
        />
      </Group>
      <Group align="flex-end" wrap="nowrap">
        <Checkbox
          label="Elevação mínima"
          checked={params.useMinEl}
          onChange={(e) => set_({ useMinEl: e.currentTarget.checked })}
          mb={8}
        />
        <NumberInput value={params.minEl} onChange={(v) => set_({ minEl: Number(v) })} min={-5} max={89} disabled={!params.useMinEl} suffix="°" w={90} />
      </Group>
      <Checkbox
        label="Incluir passagens cortadas pela janela"
        checked={params.includePartial}
        onChange={(e) => set_({ includePartial: e.currentTarget.checked })}
      />
      <RadarSelect value={radar} onChange={setRadar} />
      <Group gap="xs">
        <RadarsManager />
      </Group>
      <Group grow>
        <Button leftSection={<IconSearch size={16} />} onClick={run} loading={progress != null && progress.fraction === 0} disabled={!set}>
          Buscar passagens
        </Button>
        {progress && (
          <Button variant="default" leftSection={<IconPlayerStopFilled size={14} />} onClick={() => abort.current?.abort()}>
            Cancelar
          </Button>
        )}
      </Group>
      {progress && (
        <Stack gap={4}>
          <Progress value={progress.fraction * 100} animated />
          <Text size="xs" c="dimmed">
            {progress.stage} · {fmtNum(progress.fraction * 100)}%
          </Text>
        </Stack>
      )}
      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Stack>
  )
}
