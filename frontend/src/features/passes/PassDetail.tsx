import { Accordion, ActionIcon, Alert, Checkbox, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { lazy, type ReactNode, Suspense } from 'react'
import { api, withElementSet } from '../../api/client'
import type { PassRow, Site, TrajectoryResponse } from '../../api/types'
import { type CurrentSet, updateSetId } from '../../elements/store'
import { fmtNum, plural } from '../../lib/format'
import { Loading } from '../Loading'
import { passRef, type SelectionNav } from './logic'

const RCS_SOURCE: Record<string, string> = {
  catalogo: 'SATCAT do Celestrak',
  tabela: 'tabela do app antigo',
  classe: 'estimado pela classe',
}

const PassCharts = lazy(() => import('./PassCharts'))
const PointsGlobe = lazy(() => import('../../globe/PointsGlobe'))
const GLOBE_HEIGHT = 720 // px

/** Percorre as passagens selecionadas sem voltar à tabela; marca ou desmarca a aberta. */
export function SelectionNavBar({
  nav,
  isSelected,
  onToggle,
  onGo,
}: {
  nav: SelectionNav
  isSelected: boolean
  onToggle: () => void
  onGo: (id: string) => void
}) {
  return (
    <Group justify="space-between" wrap="wrap">
      <Checkbox label="Selecionada" checked={isSelected} onChange={onToggle} />
      {nav.total > 0 && (
        <Group gap="xs">
          <ActionIcon
            variant="default"
            aria-label="Selecionada anterior"
            disabled={!nav.prev}
            onClick={() => nav.prev && onGo(nav.prev)}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text size="sm" c="dimmed" miw={150} ta="center">
            {nav.index != null
              ? `${fmtNum(nav.index + 1)} de ${plural(nav.total, 'selecionada', 'selecionadas')}`
              : `fora da seleção (${plural(nav.total, 'selecionada', 'selecionadas')})`}
          </Text>
          <ActionIcon
            variant="default"
            aria-label="Próxima selecionada"
            disabled={!nav.next}
            onClick={() => nav.next && onGo(nav.next)}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      )}
    </Group>
  )
}

function SectionTitle({ title, summary }: { title: string; summary: string }) {
  return (
    <Group gap="xs">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      <Text size="sm" c="dimmed">
        {summary}
      </Text>
    </Group>
  )
}

function TrajectoryContent({
  traj,
  height,
  children,
}: {
  traj: UseQueryResult<TrajectoryResponse>
  height: number
  children: (data: TrajectoryResponse) => ReactNode
}) {
  if (traj.error) {
    return (
      <Alert color="red" variant="light">
        {(traj.error as Error).message}
      </Alert>
    )
  }
  if (!traj.data) return <Loading height={height} />
  return <Suspense fallback={<Loading height={height} />}>{children(traj.data)}</Suspense>
}

export function PassDetail({ pass, set, site }: { pass: PassRow; set: CurrentSet; site: Site }) {
  // Seções abertas, lembradas entre passagens; fechadas, o Plotly e o Cesium nem são montados
  const [open, setOpen] = useLocalStorage<string[]>({
    key: 'orbit-tools:pass-detail-open',
    defaultValue: ['charts'],
    getInitialValueInEffect: false,
  })
  const ref = passRef(pass, false)
  const traj = useQuery({
    enabled: open.length > 0,
    queryKey: ['trajectory', set.set_id, site, ref],
    queryFn: ({ signal }) =>
      withElementSet(set, (id) => api.passes.trajectory(id, site, ref, 1, signal), updateSetId),
    staleTime: Infinity,
  })

  const facts: [string, string][] = [
    ['H0 (UTC)', pass.H0.replace('T', ' ').slice(0, 19)],
    ['Fim', pass.END_H.slice(0, 8)],
    ['Duração', `${fmtNum(pass.DURATION)} s`],
    ['Elevação máxima', `${fmtNum(pass.MAX_EL, 2)}° às ${pass.MAX_EL_H.slice(0, 8)}`],
    ['Distância mínima', `${fmtNum(pass.MIN_RANGE, 1)} km às ${pass.MIN_RANGE_H.slice(0, 8)}`],
    ['Azimute H0 → fim', `${fmtNum(pass.AZ_H0, 1)}° → ${fmtNum(pass.AZ_END, 1)}°`],
    ['Vel. azimute máx.', `${fmtNum(pass.MAX_AZ_RATE, 3)} °/s`],
    ['Idade dos elementos', `${fmtNum(pass.EPOCH_AGE, 2)} dias`],
    ['RCS', pass.RCS_USED == null ? 'desconhecido' : `${fmtNum(pass.RCS_USED, 3)} m² (${RCS_SOURCE[pass.RCS_SOURCE] ?? pass.RCS_SOURCE})`],
  ]
  if (pass.MAX_MARGIN_DB != null) {
    facts.push(['Margem máx.', `${fmtNum(pass.MAX_MARGIN_DB, 1)} dB`], ['Detectável', `${fmtNum(pass.DETECTABLE_S ?? 0)} s`])
  }

  return (
    <Stack gap="md">
      <Title order={4}>
        {pass.NORAD_CAT_ID} · {pass.OBJECT_NAME}
      </Title>
      <SimpleGrid cols={{ base: 2, md: 4, xl: 6 }} spacing="xs">
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
      <Accordion multiple value={open} onChange={setOpen} variant="separated">
        <Accordion.Item value="charts">
          <Accordion.Control>
            <SectionTitle
              title="Céu do sensor e taxas"
              summary={`El. máx ${fmtNum(pass.MAX_EL, 1)}° · vel. az. máx ${fmtNum(pass.MAX_AZ_RATE, 2)} °/s`}
            />
          </Accordion.Control>
          <Accordion.Panel>
            {open.includes('charts') && (
              <TrajectoryContent traj={traj} height={420}>
                {(data) => <PassCharts traj={data} h0={pass.H0} />}
              </TrajectoryContent>
            )}
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="globe">
          <Accordion.Control>
            <SectionTitle title="Globo" summary="traço no solo" />
          </Accordion.Control>
          <Accordion.Panel>
            {open.includes('globe') && (
              <TrajectoryContent traj={traj} height={GLOBE_HEIGHT}>
                {(data) => (
                  <PointsGlobe lat={data.lat} lon={data.lon} height={data.height} sites={[site]} line height_px={GLOBE_HEIGHT} />
                )}
              </TrajectoryContent>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  )
}
