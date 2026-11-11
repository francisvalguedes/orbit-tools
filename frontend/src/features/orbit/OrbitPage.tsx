import { Alert, Anchor, AppShell, Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Tabs, Text, TextInput, Title } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconChartLine, IconDownload, IconTable, IconWorld } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { api, useMeta, withElementSet } from '../../api/client'
import type { EphemerisRequest, EphemerisResponse, Series, Site } from '../../api/types'
import { updateSetId, useElementSet } from '../../elements/store'
import { download, toCsv } from '../../lib/csv'
import { fmtNum } from '../../lib/format'
import { useModule } from '../../modules'
import { SiteSelect } from '../../sites/SiteSelect'
import { type ResultColumn, ResultTable } from '../convert/ResultTable'
import { Loading } from '../Loading'

const OrbitGlobe = lazy(() => import('./OrbitGlobe'))
const OrbitCharts = lazy(() => import('./OrbitCharts'))

// Colunas da tabela e do CSV (nomes no estilo do CSV de dados do app antigo)
const COLUMNS: { label: string; key: keyof EphemerisResponse; digits: number }[] = [
  { label: 'TEME_X', key: 'teme_x', digits: 3 },
  { label: 'TEME_Y', key: 'teme_y', digits: 3 },
  { label: 'TEME_Z', key: 'teme_z', digits: 3 },
  { label: 'TEME_VX', key: 'teme_vx', digits: 4 },
  { label: 'TEME_VY', key: 'teme_vy', digits: 4 },
  { label: 'TEME_VZ', key: 'teme_vz', digits: 4 },
  { label: 'ITRS_X', key: 'ecef_x', digits: 3 },
  { label: 'ITRS_Y', key: 'ecef_y', digits: 3 },
  { label: 'ITRS_Z', key: 'ecef_z', digits: 3 },
  { label: 'ITRS_VX', key: 'ecef_vx', digits: 4 },
  { label: 'ITRS_VY', key: 'ecef_vy', digits: 4 },
  { label: 'ITRS_VZ', key: 'ecef_vz', digits: 4 },
  { label: 'lat', key: 'lat', digits: 6 },
  { label: 'lon', key: 'lon', digits: 6 },
  { label: 'height', key: 'height', digits: 3 },
  { label: 'ENU_E', key: 'e', digits: 3 },
  { label: 'ENU_N', key: 'n', digits: 3 },
  { label: 'ENU_U', key: 'u', digits: 3 },
  { label: 'AZIMUTH', key: 'az', digits: 4 },
  { label: 'ELEVATION', key: 'el', digits: 4 },
  { label: 'RANGE', key: 'range', digits: 3 },
]

function nowMinuteUtc() {
  return new Date().toISOString().slice(0, 16)
}

export function OrbitPage() {
  const { current: set } = useElementSet()
  const meta = useMeta()
  const [, setModule] = useModule()
  const [objectKey, setObjectKey] = useState<string | null>(null)
  const [start, setStart] = useState(nowMinuteUtc)
  const [hours, setHours] = useLocalStorage<number>({ key: 'orbit-tools:orbit-hours', defaultValue: 3 })
  const [step, setStep] = useLocalStorage<number>({ key: 'orbit-tools:orbit-step', defaultValue: 30 })
  const [site, setSite] = useState<Site | null>(null)
  const [tab, setTab] = useLocalStorage<string>({ key: 'orbit-tools:orbit-tab', defaultValue: 'globe' })
  const [error, setError] = useState<string | null>(null)

  const options = useMemo(
    () =>
      (set?.records ?? []).map((r) => ({
        value: `${r.NORAD_CAT_ID}|${r.EPOCH}`,
        label: `${r.NORAD_CAT_ID} · ${r.OBJECT_NAME ?? ''} · época ${String(r.EPOCH).slice(0, 16).replace('T', ' ')}`,
      })),
    [set],
  )
  const chosen = objectKey ?? options[0]?.value ?? null
  const record = set?.records.find((r) => `${r.NORAD_CAT_ID}|${r.EPOCH}` === chosen) ?? null
  const points = Math.floor((hours * 3600) / step) + 1
  const maxPoints = meta.data?.limits.max_trajectory_points

  const mutation = useMutation({
    mutationFn: (req: EphemerisRequest) => withElementSet(set!, (id) => api.orbit.ephemeris({ ...req, set_id: id }), updateSetId),
  })
  const eph = mutation.data

  const run = () => {
    if (!set || !record) return setError('Escolha um objeto.')
    if (!(hours > 0 && step > 0)) return setError('Duração e passo devem ser positivos.')
    setError(null)
    mutation.mutate({
      set_id: set.set_id,
      norad: Number(record.NORAD_CAT_ID),
      epoch: String(record.EPOCH),
      start: `${start}:00`,
      duration_s: hours * 3600,
      step_s: step,
      site,
    })
  }

  const columns = useMemo<ResultColumn[]>(() => {
    if (!eph) return []
    return [
      { key: 'time', label: 'Time (UTC)', values: eph.time },
      ...COLUMNS.filter((c) => eph[c.key] != null).map((c) => ({
        key: c.label,
        label: c.label,
        digits: c.digits,
        values: eph[c.key] as Series,
      })),
    ]
  }, [eph])

  const exportCsv = () => {
    if (!eph || !record) return
    const cols = COLUMNS.filter((c) => eph[c.key] != null)
    const rows = eph.time.map((t, i) => [t, ...cols.map((c) => (eph[c.key] as Series)[i])])
    download(toCsv(['Time', ...cols.map((c) => c.label)], rows), `efemerides_${record.NORAD_CAT_ID}_${start.replaceAll(':', '-')}.csv`)
  }

  const facts: [string, string][] = eph
    ? [
        ['Período', `${fmtNum(eph.period_s / 60, 2)} min`],
        ['Perigeu', `${fmtNum(eph.perigee_km, 1)} km`],
        ['Apogeu', `${fmtNum(eph.apogee_km, 1)} km`],
        ['Inclinação', `${fmtNum(eph.inclination_deg, 3)}°`],
        ['Idade dos elementos', `${fmtNum(eph.epoch_age_days, 2)} dias`],
        ['Pontos', fmtNum(eph.t.length)],
      ]
    : []
  const errors = eph ? eph.error.filter((e) => e !== 0).length : 0

  return (
    <>
      <AppShell.Navbar p="md">
        <AppShell.Section grow style={{ overflowY: 'auto' }}>
          <Stack gap="sm">
            <Select
              label="Objeto"
              description="Do conjunto carregado no módulo Elementos"
              data={options}
              value={chosen}
              onChange={setObjectKey}
              searchable
              limit={200}
              nothingFoundMessage="Nenhum objeto"
              disabled={!set}
            />
            <TextInput type="datetime-local" label="Início (UTC)" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
            <Group grow>
              <NumberInput label="Duração (h)" value={hours} onChange={(v) => setHours(Number(v))} min={0.01} decimalScale={2} />
              <NumberInput label="Passo (s)" value={step} onChange={(v) => setStep(Number(v))} min={0.01} decimalScale={3} />
            </Group>
            <Text size="xs" c={maxPoints && points > maxPoints ? 'red' : 'dimmed'}>
              {fmtNum(points)} pontos{maxPoints && points > maxPoints ? ` (limite ${fmtNum(maxPoints)})` : ''}
            </Text>
            <SiteSelect
              label="Local (opcional)"
              description="Acrescenta ENU, azimute, elevação e distância"
              value={site}
              onChange={setSite}
              placeholder="Nenhum"
              clearable
            />
            <Button onClick={run} loading={mutation.isPending} disabled={!set}>
              Calcular efemérides
            </Button>
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="md">
          <Title order={3}>Órbita</Title>
          {!set && (
            <Alert variant="light">
              Carregue elementos orbitais primeiro, no módulo{' '}
              <Anchor component="button" onClick={() => setModule('elementos')}>
                Elementos
              </Anchor>
              .
            </Alert>
          )}
          {(error || mutation.error) && (
            <Alert color="red" variant="light">
              {error ?? (mutation.error as Error).message}
            </Alert>
          )}
          {set && !eph && !mutation.isPending && (
            <Alert variant="light">
              Escolha o objeto, o intervalo e o passo no painel ao lado. A saída vem em TEME, ITRS (ECEF) e geodésicas
              (WGS84), com velocidades; com um local, também em ENU e azimute, elevação e distância.
            </Alert>
          )}
          {eph && record && (
            <>
              <Group justify="space-between">
                <Text fw={600}>
                  {record.NORAD_CAT_ID} · {record.OBJECT_NAME}
                </Text>
                <Button variant="default" size="xs" leftSection={<IconDownload size={14} />} onClick={exportCsv}>
                  Baixar CSV
                </Button>
              </Group>
              <SimpleGrid cols={{ base: 2, md: 3, xl: 6 }} spacing="xs">
                {facts.map(([label, value]) => (
                  <Paper key={label} withBorder p="xs">
                    <Text size="xs" c="dimmed">
                      {label}
                    </Text>
                    <Text size="sm" fw={600}>
                      {value}
                    </Text>
                  </Paper>
                ))}
              </SimpleGrid>
              {errors > 0 && (
                <Alert color="yellow" variant="light">
                  {errors} amostras com erro do SGP4 (objeto pode ter reentrado); aparecem vazias.
                </Alert>
              )}
              <Tabs value={tab} onChange={(v) => setTab(v ?? 'globe')} keepMounted={false}>
                <Tabs.List mb="md">
                  <Tabs.Tab value="globe" leftSection={<IconWorld size={16} />}>
                    Globo
                  </Tabs.Tab>
                  <Tabs.Tab value="charts" leftSection={<IconChartLine size={16} />}>
                    Gráficos
                  </Tabs.Tab>
                  <Tabs.Tab value="table" leftSection={<IconTable size={16} />}>
                    Tabela
                  </Tabs.Tab>
                </Tabs.List>
                <Suspense fallback={<Loading />}>
                  <Tabs.Panel value="globe">
                    <OrbitGlobe eph={eph} site={site} name={String(record.OBJECT_NAME ?? record.NORAD_CAT_ID)} />
                  </Tabs.Panel>
                  <Tabs.Panel value="charts">
                    <OrbitCharts eph={eph} />
                  </Tabs.Panel>
                  <Tabs.Panel value="table">
                    <Text size="xs" c="dimmed" mb={4}>
                      Posições em m, velocidades em m/s, ângulos em graus.
                    </Text>
                    <ResultTable columns={columns} />
                  </Tabs.Panel>
                </Suspense>
              </Tabs>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </>
  )
}
