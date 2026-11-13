import { Alert, Anchor, AppShell, Badge, Button, Group, SegmentedControl, Stack, Tabs, Text, Title } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconChartBar, IconDownload, IconFileZip, IconListDetails, IconTable } from '@tabler/icons-react'
import { lazy, Suspense, useMemo } from 'react'
import type { PassRow } from '../../api/types'
import { useElementSet } from '../../elements/store'
import { download, toCsv } from '../../lib/csv'
import { plural } from '../../lib/format'
import { useModule } from '../../modules'
import { Loading } from '../Loading'
import { conflicts as findConflicts, passId, selectionNav } from './logic'
import { ExportPanel } from './ExportPanel'
import { PassDetail, SelectionNavBar } from './PassDetail'
import { PassesTable } from './PassesTable'
import { RulesPanel } from './RulesPanel'
import { SearchPanel } from './SearchPanel'
import { updatePasses, usePassesState } from './store'

const TimelineChart = lazy(() => import('./TimelineChart'))

function summaryCsv(rows: PassRow[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return toCsv(columns, rows.map((r) => columns.map((c) => r[c] as string | number | null)))
}

export function PassesPage() {
  const { current: set } = useElementSet()
  const state = usePassesState()
  const [, setModule] = useModule()
  const [tab, setTab] = useLocalStorage<string>({ key: 'orbit-tools:passes-tab', defaultValue: 'table' })
  const [gapS, setGapS] = useLocalStorage<number>({ key: 'orbit-tools:passes-gap', defaultValue: 0 })
  const [timelineScope, setTimelineScope] = useLocalStorage<'all' | 'selected'>({
    key: 'orbit-tools:passes-timeline',
    defaultValue: 'all',
  })

  const passes = useMemo(() => state?.result.passes ?? [], [state])
  const selected = useMemo(() => new Set(state?.selected ?? []), [state])
  const selectedRows = useMemo(() => passes.filter((p) => selected.has(passId(p))), [passes, selected])
  const conflicting = useMemo(() => findConflicts(selectedRows, gapS), [selectedRows, gapS])
  const focus = passes.find((p) => passId(p) === state?.focus) ?? null
  const hasRadar = state?.radar != null
  // O conjunto de elementos mudou depois da busca: os arquivos sairiam de outros elementos
  const stale = state != null && set != null && !set.records.some((r) => r.NORAD_CAT_ID === passes[0]?.NORAD_CAT_ID)

  const setSelected = (ids: Set<string>) => updatePasses({ selected: [...ids] })
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <>
      <AppShell.Navbar p="md">
        <AppShell.Section grow style={{ overflowY: 'auto' }}>
          <SearchPanel set={set} />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="md">
          <Title order={3}>Passagens</Title>
          {!set && (
            <Alert variant="light">
              Carregue elementos orbitais primeiro, no módulo{' '}
              <Anchor component="button" onClick={() => setModule('elementos')}>
                Elementos
              </Anchor>
              .
            </Alert>
          )}
          {set && !state && (
            <Alert variant="light">
              Escolha o local do sensor, a janela de busca e as distâncias no painel ao lado e busque as passagens dos{' '}
              {plural(new Set(set.records.map((r) => r.NORAD_CAT_ID)).size, 'objeto')} carregados.
            </Alert>
          )}
          {state && (
            <>
              <Group justify="space-between" wrap="wrap">
                <Group gap="xs">
                  <Badge size="lg" variant="light">
                    {plural(passes.length, 'passagem', 'passagens')}
                  </Badge>
                  <Badge size="lg" variant="light" color="gray">
                    {plural(state.result.objects, 'objeto propagado', 'objetos propagados')}
                  </Badge>
                  <Text size="sm" c="dimmed">
                    {state.site.name}
                    {state.radar ? ` · ${state.radar.name}` : ''} · EOP: {state.result.eop}
                  </Text>
                </Group>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => download(summaryCsv(passes), `${state.site.name}_traj_summary.csv`)}
                  disabled={!passes.length}
                >
                  Resumo CSV
                </Button>
              </Group>
              {state.result.excluded_perigee.length > 0 && (
                <Text size="xs" c="dimmed">
                  {plural(state.result.excluded_perigee.length, 'objeto não propagado', 'objetos não propagados')}: perigeu
                  acima da distância máxima.
                </Text>
              )}
              {state.result.warnings.map((w) => (
                <Alert key={w} color="yellow" variant="light">
                  {w}
                </Alert>
              ))}
              {stale && (
                <Alert color="orange" variant="light">
                  O conjunto de elementos mudou depois desta busca. Busque de novo antes de gerar os arquivos.
                </Alert>
              )}
              {passes.length === 0 ? (
                <Alert variant="light">Nenhuma passagem nesta janela com esses critérios.</Alert>
              ) : (
                <>
                  <RulesPanel
                    passes={passes}
                    selected={selected}
                    conflicts={conflicting}
                    hasRadar={hasRadar}
                    gapS={gapS}
                    onGap={setGapS}
                    onSelect={setSelected}
                  />
                  <Tabs value={tab} onChange={(v) => setTab(v ?? 'table')} keepMounted={false}>
                    <Tabs.List mb="md">
                      <Tabs.Tab value="table" leftSection={<IconTable size={16} />}>
                        Tabela
                      </Tabs.Tab>
                      <Tabs.Tab value="timeline" leftSection={<IconChartBar size={16} />}>
                        Linha do tempo
                      </Tabs.Tab>
                      <Tabs.Tab value="detail" leftSection={<IconListDetails size={16} />}>
                        Passagem
                      </Tabs.Tab>
                      <Tabs.Tab value="export" leftSection={<IconFileZip size={16} />}>
                        Gerar arquivos {selected.size > 0 && `(${selected.size})`}
                      </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="table">
                      <PassesTable
                        passes={passes}
                        selected={selected}
                        conflicts={conflicting}
                        focus={state.focus}
                        hasRadar={hasRadar}
                        onToggle={toggle}
                        onSelectPage={(ids, on) => {
                          const next = new Set(selected)
                          for (const id of ids) {
                            if (on) next.add(id)
                            else next.delete(id)
                          }
                          setSelected(next)
                        }}
                        onFocus={(id) => {
                          updatePasses({ focus: id })
                          setTab('detail')
                        }}
                      />
                    </Tabs.Panel>
                    <Tabs.Panel value="timeline">
                      <Group justify="space-between" mb={4}>
                        <Text size="xs" c="dimmed">
                          Clique numa barra para selecionar ou desmarcar a passagem.
                        </Text>
                        <SegmentedControl
                          size="xs"
                          value={timelineScope}
                          onChange={(v) => setTimelineScope(v as 'all' | 'selected')}
                          data={[
                            { value: 'all', label: 'Todas' },
                            { value: 'selected', label: 'Só as selecionadas' },
                          ]}
                        />
                      </Group>
                      <Suspense fallback={<Loading />}>
                        <TimelineChart
                          passes={timelineScope === 'selected' ? selectedRows : passes}
                          selected={selected}
                          conflicts={conflicting}
                          onToggle={toggle}
                        />
                      </Suspense>
                    </Tabs.Panel>
                    <Tabs.Panel value="detail">
                      {focus && set ? (
                        <Stack gap="md">
                          <SelectionNavBar
                            nav={selectionNav(passes, selected, passId(focus))}
                            isSelected={selected.has(passId(focus))}
                            onToggle={() => toggle(passId(focus))}
                            onGo={(id) => updatePasses({ focus: id })}
                          />
                          <PassDetail key={passId(focus)} pass={focus} set={set} site={state.site} />
                        </Stack>
                      ) : (
                        <Alert variant="light">Clique numa passagem da tabela.</Alert>
                      )}
                    </Tabs.Panel>
                    <Tabs.Panel value="export">
                      {set && (
                        <ExportPanel
                          key={state.radar?.name ?? 'sem-radar'}
                          selected={selectedRows}
                          conflicts={conflicting.size}
                          set={set}
                          site={state.site}
                          radar={state.radar}
                        />
                      )}
                    </Tabs.Panel>
                  </Tabs>
                </>
              )}
            </>
          )}
        </Stack>
      </AppShell.Main>
    </>
  )
}
