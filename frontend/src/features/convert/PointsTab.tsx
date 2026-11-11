import {
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  MultiSelect,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
} from '@mantine/core'
import { IconDownload, IconFileUpload, IconTable, IconWorld } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { ConvertPointsRequest, ConvertPointsResponse, CoordinateSystem, Site } from '../../api/types'
import { download, guessColumn, readCsvFile, type Table, toCsv, toNumber } from '../../lib/csv'
import { SiteSelect } from '../../sites/SiteSelect'
import { useAllSites } from '../../sites/store'
import { Loading } from '../Loading'
import { type ResultColumn, ResultTable } from './ResultTable'

const PointsGlobe = lazy(() => import('../../globe/PointsGlobe'))

const SYSTEMS: { value: CoordinateSystem; label: string; components: [string, string, string] }[] = [
  { value: 'geodetic', label: 'Geodésicas', components: ['Latitude (°)', 'Longitude (°)', 'Altura'] },
  { value: 'ecef', label: 'ECEF', components: ['X', 'Y', 'Z'] },
  { value: 'enu', label: 'ENU', components: ['E (x)', 'N (y)', 'U (z)'] },
  { value: 'aer', label: 'AZ/EL/D', components: ['Azimute', 'Elevação', 'Distância'] },
]

// Nomes de coluna reconhecidos, inclusive os dos CSVs dos apps antigos
const GUESS: Record<CoordinateSystem, string[][]> = {
  geodetic: [['lat', 'latitude'], ['lon', 'longitude'], ['height', 'altura', 'altitude(m)', 'altitude', 'h']],
  ecef: [['ECEF_X', 'ITRS_X', 'X'], ['ECEF_Y', 'ITRS_Y', 'Y'], ['ECEF_Z', 'ITRS_Z', 'Z']],
  enu: [['x', 'e', 'ENU_E', 'east'], ['y', 'n', 'ENU_N', 'north'], ['z', 'u', 'ENU_U', 'up']],
  aer: [['Az', 'AZIMUTH', 'azimute'], ['El', 'ELEVATION', 'elevação', 'elevacao'], ['r', 'RANGE', 'd', 'distância']],
}
const NAME_GUESS = ['name', 'nome', 'Time', 'tempo']

interface Input {
  names: string[]
  a: number[]
  b: number[]
  c: number[]
  original?: Table
}

function parseManual(text: string): Input {
  const out: Input = { names: [], a: [], b: [], c: [] }
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const parts = line.split(/[\s,;]+/)
    const name = parts.length === 4 && Number.isNaN(Number(parts[0])) ? parts.shift()! : `${out.a.length + 1}`
    const nums = parts.map(Number)
    if (nums.length !== 3 || nums.some((v) => !Number.isFinite(v))) {
      throw new Error(`Linha ${i + 1}: esperados 3 números (opcionalmente precedidos de um nome).`)
    }
    out.names.push(name)
    out.a.push(nums[0])
    out.b.push(nums[1])
    out.c.push(nums[2])
  })
  if (out.a.length === 0) throw new Error('Nenhum ponto informado.')
  return out
}

function fromTable(table: Table, cols: (string | null)[], nameCol: string | null): Input {
  if (cols.some((c) => !c)) throw new Error('Escolha as três colunas de entrada.')
  const out: Input = { names: [], a: [], b: [], c: [], original: table }
  table.rows.forEach((row, i) => {
    const v = cols.map((c) => toNumber(row[c!]))
    if (v.some((x) => !Number.isFinite(x))) throw new Error(`Linha ${i + 2}: valor não numérico nas colunas escolhidas.`)
    out.names.push(nameCol ? (row[nameCol] ?? '') : `${i + 1}`)
    out.a.push(v[0])
    out.b.push(v[1])
    out.c.push(v[2])
  })
  return out
}

/** Colunas de saída com os nomes do conversor antigo (x_<local>, az_<local>…). */
function outputColumns(res: ConvertPointsResponse): ResultColumn[] {
  const cols: ResultColumn[] = [
    { key: 'lat', label: 'lat', digits: 8, values: res.lat },
    { key: 'lon', label: 'lon', digits: 8, values: res.lon },
    { key: 'height', label: 'height', digits: 3, values: res.height },
    { key: 'ECEF_X', label: 'ECEF_X', digits: 3, values: res.x },
    { key: 'ECEF_Y', label: 'ECEF_Y', digits: 3, values: res.y },
    { key: 'ECEF_Z', label: 'ECEF_Z', digits: 3, values: res.z },
  ]
  for (const loc of res.local) {
    const s = loc.site.name
    cols.push(
      { key: `x_${s}`, label: `x_${s}`, digits: 3, values: loc.e },
      { key: `y_${s}`, label: `y_${s}`, digits: 3, values: loc.n },
      { key: `z_${s}`, label: `z_${s}`, digits: 3, values: loc.u },
      { key: `az_${s}`, label: `az_${s}`, digits: 6, values: loc.az },
      { key: `el_${s}`, label: `el_${s}`, digits: 6, values: loc.el },
      { key: `r_${s}`, label: `r_${s}`, digits: 3, values: loc.range },
    )
  }
  return cols
}

export function PointsTab() {
  const { sites } = useAllSites()
  const [system, setSystem] = useState<CoordinateSystem>('geodetic')
  const [reference, setReference] = useState<Site | null>(null)
  const [outputs, setOutputs] = useState<string[]>([])
  const [lengthUnit, setLengthUnit] = useState<'m' | 'km'>('m')
  const [angleUnit, setAngleUnit] = useState<'deg' | 'rad'>('deg')
  const [mode, setMode] = useState<string | null>('manual')
  const [text, setText] = useState('')
  const [table, setTable] = useState<Table | null>(null)
  const [fileName, setFileName] = useState('')
  const [cols, setCols] = useState<(string | null)[]>([null, null, null])
  const [nameCol, setNameCol] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState<Input | null>(null)
  const [view, setView] = useState<string | null>('table')

  const spec = SYSTEMS.find((s) => s.value === system)!
  const needsReference = system === 'enu' || system === 'aer'
  const outputSites = useMemo(() => sites.filter((s) => outputs.includes(s.name)), [sites, outputs])

  const mutation = useMutation({ mutationFn: (req: ConvertPointsRequest) => api.convert.points(req) })

  const guess = (t: Table, sys: CoordinateSystem) => {
    setCols(GUESS[sys].map((cands) => guessColumn(t.columns, cands)))
    setNameCol(guessColumn(t.columns, NAME_GUESS))
  }

  const loadFile = async (file: File | null) => {
    if (!file) return
    try {
      const t = await readCsvFile(file)
      setTable(t)
      setFileName(file.name)
      guess(t, system)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const changeSystem = (v: string) => {
    setSystem(v as CoordinateSystem)
    if (table) guess(table, v as CoordinateSystem)
  }

  const run = () => {
    try {
      if (needsReference && !reference) throw new Error('Escolha o local de referência dos pontos.')
      const parsed = mode === 'csv' ? (table ? fromTable(table, cols, nameCol) : null) : parseManual(text)
      if (!parsed) throw new Error('Carregue um arquivo CSV.')
      setError(null)
      setInput(parsed)
      mutation.mutate({
        system,
        reference: needsReference ? reference : null,
        outputs: outputSites.map(({ name, lat, lon, height }) => ({ name, lat, lon, height })),
        length_unit: lengthUnit,
        angle_unit: angleUnit,
        a: parsed.a,
        b: parsed.b,
        c: parsed.c,
      })
    } catch (e) {
      mutation.reset() // não deixa na tela o resultado de outra entrada
      setError((e as Error).message)
    }
  }

  const result = mutation.data
  const columns = useMemo(() => {
    if (!result || !input) return []
    return [{ key: '_name', label: 'nome', values: input.names }, ...outputColumns(result)]
  }, [result, input])

  const exportCsv = () => {
    if (!result || !input) return
    const out = outputColumns(result)
    const original = input.original
    const keep = original ? original.columns.filter((c) => !out.some((o) => o.label === c)) : ['name']
    const header = [...keep, ...out.map((c) => c.label)]
    const rows = input.a.map((_, i) => [
      ...(original ? keep.map((c) => original.rows[i][c]) : [input.names[i]]),
      ...out.map((c) => c.values[i]),
    ])
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'pontos'
    download(toCsv(header, rows), `${base}_convertido.csv`)
  }

  const globeSites = [...(needsReference && reference ? [reference] : []), ...outputSites]

  return (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="sm">
          <Group gap="lg" align="flex-end" wrap="wrap">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Sistema de entrada
              </Text>
              <SegmentedControl value={system} onChange={changeSystem} data={SYSTEMS} />
            </Stack>
            {system !== 'geodetic' && (
              <Select
                label="Comprimentos em"
                value={lengthUnit}
                onChange={(v) => setLengthUnit((v as 'm' | 'km') ?? 'm')}
                data={[
                  { value: 'm', label: 'metros' },
                  { value: 'km', label: 'quilômetros' },
                ]}
                w={140}
                allowDeselect={false}
              />
            )}
            {system === 'geodetic' && <Text size="sm" c="dimmed">Latitude e longitude em graus; altura em m.</Text>}
            {system === 'aer' && (
              <Select
                label="Ângulos em"
                value={angleUnit}
                onChange={(v) => setAngleUnit((v as 'deg' | 'rad') ?? 'deg')}
                data={[
                  { value: 'deg', label: 'graus' },
                  { value: 'rad', label: 'radianos' },
                ]}
                w={130}
                allowDeselect={false}
              />
            )}
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {needsReference && (
              <SiteSelect
                label="Local de referência dos pontos (origem do ENU)"
                value={reference}
                onChange={setReference}
                placeholder="Escolha um local"
              />
            )}
            <MultiSelect
              label="Saída em ENU e AZ/EL/D de"
              description={needsReference ? 'O local de referência entra sempre; acrescente outros (ENU¹ → ENU²).' : undefined}
              data={sites.map((s) => s.name)}
              value={outputs}
              onChange={setOutputs}
              placeholder={outputs.length ? undefined : 'Nenhum local'}
              searchable
              clearable
            />
          </SimpleGrid>
        </Stack>
      </Card>

      <Tabs value={mode} onChange={setMode}>
        <Tabs.List>
          <Tabs.Tab value="manual">Digitar pontos</Tabs.Tab>
          <Tabs.Tab value="csv" leftSection={<IconFileUpload size={14} />}>
            Arquivo CSV
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="manual" pt="sm">
          <Textarea
            label={`Um ponto por linha: ${spec.components.join(', ')}`}
            description="Separados por vírgula, ponto e vírgula ou espaço; ponto decimal. Opcionalmente, um nome antes dos números."
            placeholder={system === 'geodetic' ? 'P1 -9.5 -41.2 400000' : 'P1 120000 -35000 410000'}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            autosize
            minRows={4}
            maxRows={12}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="csv" pt="sm">
          <Stack gap="sm">
            <Group>
              <FileButton onChange={loadFile} accept=".csv,.txt,text/csv">
                {(props) => (
                  <Button {...props} variant="default" leftSection={<IconFileUpload size={16} />}>
                    Escolher arquivo
                  </Button>
                )}
              </FileButton>
              {table && (
                <Text size="sm" c="dimmed">
                  {fileName} · {table.rows.length} linhas · colunas: {table.columns.join(', ')}
                </Text>
              )}
            </Group>
            {table && (
              <SimpleGrid cols={{ base: 2, md: 4 }}>
                {spec.components.map((label, k) => (
                  <Select
                    key={label}
                    label={label}
                    data={table.columns}
                    value={cols[k]}
                    onChange={(v) => setCols(cols.map((c, j) => (j === k ? v : c)))}
                  />
                ))}
                <Select label="Nome (opcional)" data={table.columns} value={nameCol} onChange={setNameCol} clearable />
              </SimpleGrid>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Group>
        <Button onClick={run} loading={mutation.isPending}>
          Converter
        </Button>
        {result && (
          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportCsv}>
            Baixar CSV
          </Button>
        )}
      </Group>

      {(error || mutation.error) && (
        <Alert color="red" variant="light">
          {error ?? (mutation.error as Error).message}
        </Alert>
      )}

      {result && (
        <Tabs value={view} onChange={setView} keepMounted={false}>
          <Tabs.List mb="sm">
            <Tabs.Tab value="table" leftSection={<IconTable size={16} />}>
              Tabela
            </Tabs.Tab>
            <Tabs.Tab value="globe" leftSection={<IconWorld size={16} />}>
              Globo
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="table">
            <Text size="xs" c="dimmed" mb={4}>
              Distâncias em m, ângulos em graus, geodésicas no WGS84.
            </Text>
            <ResultTable columns={columns} />
          </Tabs.Panel>
          <Tabs.Panel value="globe">
            <Suspense fallback={<Loading />}>
              <PointsGlobe lat={result.lat} lon={result.lon} height={result.height} sites={globeSites} />
            </Suspense>
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  )
}
