import { Alert, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { api, withElementSet } from '../../api/client'
import type { PassRow, Site } from '../../api/types'
import { type CurrentSet, updateSetId } from '../../elements/store'
import { fmtNum } from '../../lib/format'
import { Loading } from '../Loading'
import { passRef } from './logic'

const RCS_SOURCE: Record<string, string> = {
  catalogo: 'SATCAT do Celestrak',
  tabela: 'tabela do app antigo',
  classe: 'estimado pela classe',
}

const PassCharts = lazy(() => import('./PassCharts'))
const PointsGlobe = lazy(() => import('../../globe/PointsGlobe'))

export function PassDetail({ pass, set, site }: { pass: PassRow; set: CurrentSet; site: Site }) {
  const ref = passRef(pass, false)
  const traj = useQuery({
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
      {traj.isLoading && <Loading height={300} />}
      {traj.error && (
        <Alert color="red" variant="light">
          {(traj.error as Error).message}
        </Alert>
      )}
      {traj.data && (
        <Suspense fallback={<Loading height={420} />}>
          <PassCharts traj={traj.data} h0={pass.H0} />
          <PointsGlobe lat={traj.data.lat} lon={traj.data.lon} height={traj.data.height} sites={[site]} line height_px={460} />
        </Suspense>
      )}
    </Stack>
  )
}
