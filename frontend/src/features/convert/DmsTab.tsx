import {
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Textarea,
} from '@mantine/core'
import { IconDownload, IconFileUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { api } from '../../api/client'
import type { DmsResult } from '../../api/types'
import { download, readCsvFile, type Table, toCsv } from '../../lib/csv'

type Direction = 'to_decimal' | 'to_dms'
type Style = 'signed' | 'hemisphere'

function format(r: DmsResult) {
  if (r.error) return `erro: ${r.error}`
  return r.text ?? (r.value == null ? '' : r.value.toFixed(10).replace(/0+$/, '').replace(/\.$/, ''))
}

export function DmsTab() {
  const [direction, setDirection] = useState<Direction>('to_decimal')
  const [style, setStyle] = useState<Style>('signed')
  const [kind, setKind] = useState<'lat' | 'lon'>('lat')
  const [decimals, setDecimals] = useState(6)
  const [mode, setMode] = useState<string | null>('manual')
  const [text, setText] = useState('')
  const [output, setOutput] = useState('')
  const [table, setTable] = useState<Table | null>(null)
  const [fileName, setFileName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const convert = (values: string[], columnKind: 'lat' | 'lon' = kind) =>
    api.convert.dms({
      direction,
      values: direction === 'to_dms' ? values.map((v) => Number(v.trim().replace(',', '.'))) : values,
      style,
      kind: columnKind,
      decimals,
    })

  const runManual = async () => {
    const values = text.split(/\r?\n/).filter((l) => l.trim())
    if (!values.length) return setError('Informe ao menos um valor.')
    setBusy(true)
    try {
      setOutput((await convert(values)).map(format).join('\n'))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runCsv = async () => {
    if (!table || !selected.length) return setError('Carregue um CSV e escolha as colunas.')
    setBusy(true)
    try {
      const suffix = direction === 'to_decimal' ? '_dd' : '_dms'
      const extra: string[][] = []
      for (const col of selected) {
        // Hemisfério: colunas com "lon" no nome usam E/W
        const colKind = /lon/i.test(col) ? 'lon' : 'lat'
        extra.push((await convert(table.rows.map((r) => r[col] ?? ''), colKind)).map(format))
      }
      const header = [...table.columns, ...selected.map((c) => `${c.replace(/_dms$/, '')}${suffix}`)]
      const rows = table.rows.map((r, i) => [...table.columns.map((c) => r[c]), ...extra.map((col) => col[i])])
      download(toCsv(header, rows), `${fileName.replace(/\.[^.]+$/, '')}_convertido.csv`)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const loadFile = async (file: File | null) => {
    if (!file) return
    try {
      const t = await readCsvFile(file)
      setTable(t)
      setFileName(file.name)
      setSelected(t.columns.filter((c) => /dms|lat|lon/i.test(c)))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Stack gap="md">
      <Card withBorder>
        <Group gap="lg" align="flex-end" wrap="wrap">
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Conversão
            </Text>
            <SegmentedControl
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
              data={[
                { value: 'to_decimal', label: 'GMS → decimal' },
                { value: 'to_dms', label: 'Decimal → GMS' },
              ]}
            />
          </Stack>
          {direction === 'to_dms' && (
            <>
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Formato
                </Text>
                <SegmentedControl
                  value={style}
                  onChange={(v) => setStyle(v as Style)}
                  data={[
                    { value: 'signed', label: `Com sinal (-5°55'20")` },
                    { value: 'hemisphere', label: `Hemisfério (5°55'20"S)` },
                  ]}
                />
              </Stack>
              {style === 'signed' ? (
                <NumberInput label="Casas dos segundos" value={decimals} onChange={(v) => setDecimals(Number(v))} min={0} max={10} w={150} />
              ) : (
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    Valores digitados são
                  </Text>
                  <SegmentedControl
                    value={kind}
                    onChange={(v) => setKind(v as 'lat' | 'lon')}
                    data={[
                      { value: 'lat', label: 'Latitudes (N/S)' },
                      { value: 'lon', label: 'Longitudes (E/W)' },
                    ]}
                  />
                </Stack>
              )}
            </>
          )}
        </Group>
      </Card>

      <Tabs value={mode} onChange={setMode}>
        <Tabs.List>
          <Tabs.Tab value="manual">Digitar valores</Tabs.Tab>
          <Tabs.Tab value="csv" leftSection={<IconFileUpload size={14} />}>
            Arquivo CSV
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="manual" pt="sm">
          <Stack gap="sm">
            <Group grow align="flex-start">
              <Textarea
                label="Um valor por linha"
                description={
                  direction === 'to_decimal'
                    ? `Ex.: -5°55'20.01" · 5°55'20.01"S · 35 09 41,44 O`
                    : 'Graus decimais, ex.: -5.922225'
                }
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                autosize
                minRows={6}
                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
              />
              <Textarea label="Resultado" description="Na mesma ordem" value={output} readOnly autosize minRows={6} styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }} />
            </Group>
            <Group>
              <Button onClick={runManual} loading={busy}>
                Converter
              </Button>
            </Group>
          </Stack>
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
                  {fileName} · {table.rows.length} linhas
                </Text>
              )}
            </Group>
            {table && (
              <>
                <MultiSelect
                  label="Colunas a converter"
                  description="O resultado entra em colunas novas; no formato com hemisfério, colunas com “lon” no nome usam E/W."
                  data={table.columns}
                  value={selected}
                  onChange={setSelected}
                />
                <Group>
                  <Button onClick={runCsv} loading={busy} leftSection={<IconDownload size={16} />}>
                    Converter e baixar CSV
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
    </Stack>
  )
}
