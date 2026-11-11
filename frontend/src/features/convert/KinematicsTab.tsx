import {
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from '@mantine/core'
import { IconChartLine, IconDownload, IconFileUpload, IconTable, IconWorld } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { ConvertPointsRequest, KinematicsRequest, KinematicsResponse, Series, Site } from '../../api/types'
import { download, toCsv } from '../../lib/csv'
import { fmtNum } from '../../lib/format'
import { SiteSelect } from '../../sites/SiteSelect'
import { Loading } from '../Loading'
import type { Group as ChartGroup } from './KinematicsCharts'
import { type ResultColumn, ResultTable } from './ResultTable'
import { example, parseTrajectory, type Trajectory } from './trajectory'

const KinematicsCharts = lazy(() => import('./KinematicsCharts'))
const PointsGlobe = lazy(() => import('../../globe/PointsGlobe'))

const EXPORT: { label: string; key: keyof KinematicsResponse }[] = [
  { label: 'TR(s)', key: 't' },
  { label: 'X(m)', key: 'e' },
  { label: 'Y(m)', key: 'n' },
  { label: 'Z(m)', key: 'u' },
  { label: 'VX(m/s)', key: 've' },
  { label: 'VY(m/s)', key: 'vn' },
  { label: 'VZ(m/s)', key: 'vu' },
  { label: 'AX(m/s²)', key: 'ae' },
  { label: 'AY(m/s²)', key: 'an' },
  { label: 'AZ(m/s²)', key: 'au' },
  { label: 'Az(°)', key: 'az' },
  { label: 'El(°)', key: 'el' },
  { label: 'd(m)', key: 'range' },
  { label: 'Vaz(°/s)', key: 'v_az' },
  { label: 'Vel(°/s)', key: 'v_el' },
  { label: 'Vr(m/s)', key: 'v_range' },
  { label: 'Aaz(°/s²)', key: 'a_az' },
  { label: 'Ael(°/s²)', key: 'a_el' },
  { label: 'Ar(m/s²)', key: 'a_range' },
]

function maxAbs(s: Series): number | null {
  let m: number | null = null
  for (const v of s) if (v != null && (m == null || Math.abs(v) > m)) m = Math.abs(v)
  return m
}

export function KinematicsTab() {
  const [traj, setTraj] = useState<Trajectory | null>(null)
  const [source, setSource] = useState<Site | null>(null)
  const [target, setTarget] = useState<Site | null>(null)
  const [step, setStep] = useState<number>(1)
  const [unit, setUnit] = useState<'m' | 'km'>('m')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<string | null>('charts')
  const [group, setGroup] = useState<ChartGroup>('aer')
  const mutation = useMutation({ mutationFn: (req: KinematicsRequest) => api.convert.kinematics(req) })
  const result = mutation.data

  const loadFile = async (file: File | null) => {
    if (!file) return
    try {
      setTraj(parseTrajectory(await file.text(), file.name))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const run = () => {
    if (!traj) return setError('Carregue uma trajetória.')
    if (!source) return setError('Escolha o local de origem da trajetória.')
    setError(null)
    mutation.mutate({ x: traj.x, y: traj.y, z: traj.z, step_s: step, source, target, length_unit: unit })
  }

  const columns = useMemo<ResultColumn[]>(
    () =>
      result
        ? EXPORT.map((c) => ({
            key: c.key,
            label: c.label,
            digits: c.key === 't' ? 3 : c.label.includes('°') ? 6 : 3,
            values: result[c.key],
          }))
        : [],
    [result],
  )

  const exportCsv = () => {
    if (!result || !traj) return
    const rows = result.t.map((_, i) => EXPORT.map((c) => result[c.key][i]))
    download(toCsv(EXPORT.map((c) => c.label), rows), `${traj.name.replace(/\.[^.]+$/, '')}_cinematica.csv`)
  }

  const frame = target ?? source
  const stats = result && [
    ['Elevação máxima', `${fmtNum(Math.max(...(result.el.filter((v) => v != null) as number[])), 3)}°`],
    ['Distância mínima', `${fmtNum(Math.min(...(result.range.filter((v) => v != null) as number[])), 1)} m`],
    ['|Vel. azimute| máx.', `${fmtNum(maxAbs(result.v_az), 4)} °/s`],
    ['|Acel. azimute| máx.', `${fmtNum(maxAbs(result.a_az), 4)} °/s²`],
    ['|Vel. elevação| máx.', `${fmtNum(maxAbs(result.v_el), 4)} °/s`],
    ['|Acel. elevação| máx.', `${fmtNum(maxAbs(result.a_el), 4)} °/s²`],
  ]

  return (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Trajetória cartesiana sem ruído, em ENU de um local de origem (por exemplo, a rampa), amostrada
            uniformemente. Calcula posição, velocidade e aceleração em ENU e em azimute, elevação e distância no
            referencial de destino (por exemplo, o sensor).
          </Text>
          <Group gap="sm">
            <FileButton onChange={loadFile} accept=".csv,.txt,.trn,text/csv">
              {(props) => (
                <Button {...props} variant="default" leftSection={<IconFileUpload size={16} />}>
                  Arquivo (.csv ou .trn)
                </Button>
              )}
            </FileButton>
            <Button variant="subtle" onClick={() => setTraj(example())}>
              Usar exemplo sintético
            </Button>
            {traj && (
              <Text size="sm" c="dimmed">
                {traj.name} · {fmtNum(traj.x.length)} pontos
              </Text>
            )}
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <SiteSelect label="Origem da trajetória (ENU¹)" value={source} onChange={setSource} placeholder="Escolha" />
            <SiteSelect
              label="Destino (ENU²)"
              value={target}
              onChange={setTarget}
              placeholder="O próprio referencial de origem"
              clearable
            />
            <NumberInput label="Tempo de amostragem (s)" value={step} onChange={(v) => setStep(Number(v))} min={0.001} max={60} decimalScale={4} />
            <Select
              label="Unidade do arquivo"
              value={unit}
              onChange={(v) => setUnit((v as 'm' | 'km') ?? 'm')}
              data={[
                { value: 'm', label: 'metros' },
                { value: 'km', label: 'quilômetros' },
              ]}
              allowDeselect={false}
            />
          </SimpleGrid>
          <Group>
            <Button onClick={run} loading={mutation.isPending}>
              Calcular
            </Button>
            {result && (
              <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportCsv}>
                Baixar CSV
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      {(error || mutation.error) && (
        <Alert color="red" variant="light">
          {error ?? (mutation.error as Error).message}
        </Alert>
      )}

      {result && stats && (
        <>
          <SimpleGrid cols={{ base: 2, md: 3, xl: 6 }}>
            {stats.map(([label, value]) => (
              <Paper key={label} withBorder p="sm">
                <Text size="xs" c="dimmed">
                  {label}
                </Text>
                <Text fw={600}>{value}</Text>
              </Paper>
            ))}
          </SimpleGrid>
          <Tabs value={view} onChange={setView} keepMounted={false}>
            <Tabs.List mb="sm">
              <Tabs.Tab value="charts" leftSection={<IconChartLine size={16} />}>
                Gráficos
              </Tabs.Tab>
              <Tabs.Tab value="table" leftSection={<IconTable size={16} />}>
                Tabela
              </Tabs.Tab>
              <Tabs.Tab value="globe" leftSection={<IconWorld size={16} />}>
                Globo
              </Tabs.Tab>
            </Tabs.List>
            <Suspense fallback={<Loading />}>
              <Tabs.Panel value="charts">
                <SegmentedControl
                  size="xs"
                  mb="xs"
                  value={group}
                  onChange={(v) => setGroup(v as ChartGroup)}
                  data={[
                    { value: 'aer', label: 'Azimute, elevação e distância' },
                    { value: 'enu', label: 'ENU' },
                  ]}
                />
                <KinematicsCharts data={result} group={group} />
              </Tabs.Panel>
              <Tabs.Panel value="table">
                <ResultTable columns={columns} />
              </Tabs.Panel>
              <Tabs.Panel value="globe">
                {frame && <TrajectoryGlobe result={result} frame={frame} source={source} target={target} />}
              </Tabs.Panel>
            </Suspense>
          </Tabs>
        </>
      )}
    </Stack>
  )
}

/** A trajetória no globo: converte o ENU do destino em geodésicas pela própria API. */
function TrajectoryGlobe(props: {
  result: KinematicsResponse
  frame: Site
  source: Site | null
  target: Site | null
}) {
  const { result, frame, source, target } = props
  const geo = useMutation({ mutationFn: (req: ConvertPointsRequest) => api.convert.points(req) })
  const { mutate } = geo
  useEffect(() => {
    mutate({
      system: 'enu',
      reference: frame,
      outputs: [],
      length_unit: 'm',
      angle_unit: 'deg',
      a: result.e as number[],
      b: result.n as number[],
      c: result.u as number[],
    })
  }, [mutate, result, frame])
  if (!geo.data) return <Loading />
  const sites = [source, target].filter((s): s is Site => s != null)
  return <PointsGlobe lat={geo.data.lat} lon={geo.data.lon} height={geo.data.height} sites={sites} line />
}
