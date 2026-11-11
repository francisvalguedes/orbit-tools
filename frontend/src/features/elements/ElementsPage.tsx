import { Alert, AppShell, Badge, Button, Card, Group, Stack, Tabs, Text, Title } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconArrowsDiff, IconDownload, IconTable, IconTrash } from '@tabler/icons-react'
import { useMemo } from 'react'
import { clearElementSet, useElementSet } from '../../elements/store'
import { download, toCsv } from '../../lib/csv'
import { plural } from '../../lib/format'
import { Loading } from '../Loading'
import { CompareView } from './CompareView'
import { ElementsTable } from './ElementsTable'
import { SourcePanel } from './SourcePanel'

export function ElementsPage() {
  const { current, loaded } = useElementSet()
  const [tab, setTab] = useLocalStorage<string>({ key: 'orbit-tools:elements-tab', defaultValue: 'table' })

  const objects = useMemo(() => new Set(current?.records.map((r) => r.NORAD_CAT_ID)).size, [current])

  const exportCsv = () => {
    if (!current) return
    const columns = [...new Set(current.records.flatMap((r) => Object.keys(r)))]
    download(toCsv(columns, current.records.map((r) => columns.map((c) => r[c]))), 'orbital_elem_all.csv')
  }

  return (
    <>
      <AppShell.Navbar p="md">
        <AppShell.Section grow style={{ overflowY: 'auto' }}>
          <SourcePanel />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="md">
          <Title order={3}>Elementos orbitais</Title>
          {!loaded && <Loading height={200} />}
          {loaded && !current && (
            <Alert variant="light">
              Nenhum conjunto de elementos carregado. Busque no Celestrak (sem conta), no Space-Track ou carregue um
              arquivo, no painel ao lado. Os elementos ficam guardados neste navegador e são usados pelos módulos
              Passagens e Órbita.
            </Alert>
          )}
          {current && (
            <>
              <Card withBorder>
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Badge variant="light" size="lg">
                        {plural(current.records.length, 'conjunto')}
                      </Badge>
                      <Badge variant="light" color="gray" size="lg">
                        {plural(objects, 'objeto')}
                      </Badge>
                    </Group>
                    <Text size="sm">{current.sources.join(' + ')}</Text>
                    <Text size="xs" c="dimmed">
                      Carregado em {new Date(current.loaded_at).toLocaleString('pt-BR')}
                    </Text>
                  </Stack>
                  <Group gap="xs">
                    <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportCsv}>
                      Baixar CSV
                    </Button>
                    <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={clearElementSet}>
                      Limpar
                    </Button>
                  </Group>
                </Group>
              </Card>
              {current.not_found.length > 0 && (
                <Alert color="yellow" variant="light" title={`Sem elementos para ${current.not_found.length} consulta(s)`}>
                  {current.not_found.slice(0, 60).join(', ')}
                  {current.not_found.length > 60 ? '…' : ''}
                </Alert>
              )}
              {current.decayed.length > 0 && (
                <Alert color="yellow" variant="light" title={`${current.decayed.length} objeto(s) já reentraram`}>
                  {current.decayed.slice(0, 60).join(', ')}
                  {current.decayed.length > 60 ? '…' : ''} (aparecem esmaecidos na tabela)
                </Alert>
              )}
              {current.warnings.map((w) => (
                <Alert key={w} color="yellow" variant="light">
                  {w}
                </Alert>
              ))}
              <Tabs value={tab} onChange={(v) => setTab(v ?? 'table')} keepMounted={false}>
                <Tabs.List mb="md">
                  <Tabs.Tab value="table" leftSection={<IconTable size={16} />}>
                    Tabela
                  </Tabs.Tab>
                  <Tabs.Tab value="compare" leftSection={<IconArrowsDiff size={16} />}>
                    Comparação
                  </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="table">
                  <ElementsTable records={current.records} />
                </Tabs.Panel>
                <Tabs.Panel value="compare">
                  <CompareView set={current} />
                </Tabs.Panel>
              </Tabs>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </>
  )
}
