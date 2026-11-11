import { Alert, Button, Group, Progress, Select, Stack, Text } from '@mantine/core'
import { IconDownload, IconPlayerStopFilled } from '@tabler/icons-react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { api, withElementSet } from '../../api/client'
import type { CompareRow, Progress as ProgressInfo } from '../../api/types'
import { type CurrentSet, updateSetId } from '../../elements/store'
import { download, toCsv } from '../../lib/csv'
import { fmtNum } from '../../lib/format'
import { type ResultColumn, ResultTable } from '../convert/ResultTable'
import { Loading } from '../Loading'

const CompareChart = lazy(() => import('./CompareChart'))

const COLUMNS: { key: keyof CompareRow; digits?: number }[] = [
  { key: 'NORAD_CAT_ID', digits: 0 },
  { key: 'OBJECT_NAME' },
  { key: 'EPOCH' },
  { key: 'EPOCH_1' },
  { key: 'D_ERR_MEAN', digits: 1 },
  { key: 'D_ERR_MAX', digits: 1 },
  { key: 'TRACK', digits: 0 },
  { key: 'R_ERR_MEAN', digits: 1 },
  { key: 'I_ERR_MEAN', digits: 1 },
  { key: 'C_ERR_MEAN', digits: 1 },
  { key: 'R_ERR_MAX', digits: 1 },
  { key: 'I_ERR_MAX', digits: 1 },
  { key: 'C_ERR_MAX', digits: 1 },
  { key: 'RCS_SIZE' },
  { key: 'PERIAPSIS', digits: 1 },
  { key: 'DECAY_DATE' },
]

export function CompareView({ set }: { set: CurrentSet }) {
  const [rows, setRows] = useState<CompareRow[] | null>(null)
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const multi = useMemo(() => {
    const count = new Map<number, number>()
    for (const r of set.records) count.set(Number(r.NORAD_CAT_ID), (count.get(Number(r.NORAD_CAT_ID)) ?? 0) + 1)
    return [...count.values()].filter((c) => c > 1).length
  }, [set.records])

  const run = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setError(null)
    setProgress({ fraction: 0, stage: 'enviando' })
    try {
      const result = await withElementSet(
        set,
        (id) => api.elements.compare(id, setProgress, ctrl.signal),
        updateSetId,
      )
      setRows(result)
      setSelected(result.length ? String(result[0].NORAD_CAT_ID) : null)
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  const objects = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows ?? []) seen.set(String(r.NORAD_CAT_ID), `${r.NORAD_CAT_ID} · ${r.OBJECT_NAME ?? ''}`)
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [rows])

  const columns = useMemo<ResultColumn[]>(
    () =>
      rows
        ? COLUMNS.map((c) => ({
            key: c.key,
            label: c.key,
            digits: c.digits,
            values: rows.map((r) => (r[c.key] as number | string | null) ?? null),
          }))
        : [],
    [rows],
  )

  if (multi === 0) {
    return (
      <Alert variant="light" color="gray">
        A comparação precisa de dois ou mais conjuntos de elementos do mesmo objeto. Busque o histórico no
        Space-Track ou junte arquivos com épocas diferentes (opção “Juntar ao conjunto atual”).
      </Alert>
    )
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Para cada par de conjuntos sucessivos de um objeto, propaga os dois a partir de 0,5 dia antes da época do
        anterior (80 amostras a cada 5 min) e mede a diferença de posição: total, radial, ao longo e através da órbita.
        TRACK = 1 quando o erro médio fica abaixo de 3 km. {multi === 1 ? '1 objeto pode ser comparado.' : `${multi} objetos podem ser comparados.`}
      </Text>
      <Group>
        <Button onClick={run} loading={progress != null && progress.fraction === 0}>
          Comparar
        </Button>
        {progress && (
          <Button variant="default" leftSection={<IconPlayerStopFilled size={14} />} onClick={() => abort.current?.abort()}>
            Cancelar
          </Button>
        )}
        {rows && rows.length > 0 && (
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={() =>
              download(
                toCsv(
                  COLUMNS.map((c) => c.key),
                  rows.map((r) => COLUMNS.map((c) => r[c.key] as string | number | null)),
                ),
                'orbital_elem_compare.csv',
              )
            }
          >
            Baixar CSV
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
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
      {rows && rows.length === 0 && <Alert variant="light">Nenhum par comparável (conjuntos idênticos).</Alert>}
      {rows && rows.length > 0 && (
        <>
          <Select label="Objeto no gráfico" data={objects} value={selected} onChange={setSelected} searchable w={360} />
          <Suspense fallback={<Loading height={380} />}>
            <CompareChart rows={rows.filter((r) => String(r.NORAD_CAT_ID) === selected)} />
          </Suspense>
          <ResultTable columns={columns} />
        </>
      )}
    </Stack>
  )
}
