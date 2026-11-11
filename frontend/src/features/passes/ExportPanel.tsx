import { Alert, Anchor, Button, Card, Checkbox, Group, NumberInput, Progress, Stack, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconDownload, IconFileZip, IconPlayerStopFilled } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { api, useMeta, withElementSet } from '../../api/client'
import type { ExportResult, PassRow, Progress as ProgressInfo, Radar, Site } from '../../api/types'
import { type CurrentSet, updateSetId } from '../../elements/store'
import { fmtNum, plural } from '../../lib/format'
import { passRef } from './logic'

interface Props {
  selected: PassRow[]
  conflicts: number
  set: CurrentSet
  site: Site
  radar: Radar | null
}

function startDownload(url: string, name: string) {
  const a = Object.assign(document.createElement('a'), { href: `${url}?name=${encodeURIComponent(name)}`, download: name })
  document.body.append(a)
  a.click()
  a.remove()
}

export function ExportPanel({ selected, conflicts, set, site, radar }: Props) {
  const meta = useMeta()
  const [formats, setFormats] = useLocalStorage({
    key: 'orbit-tools:export-formats',
    defaultValue: { trn: true, trj: true, data_csv: true, trn_rate: true },
  })
  const [rate, setRate] = useState<number>(radar?.spt ?? 0.01)
  const [onlyDetectable, setOnlyDetectable] = useState(false)
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const refs = selected.map((p) => passRef(p, onlyDetectable && radar != null))
  const seconds = refs.reduce((s, r) => s + r.end_pt, 0)
  const points = seconds * ((formats.trn || formats.trj || formats.data_csv ? 3 : 0) + (formats.trn_rate ? 1 / rate : 0))
  const limit = meta.data?.limits.max_export_points
  const anyFormat = Object.values(formats).some(Boolean)

  const run = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setError(null)
    setResult(null)
    setProgress({ fraction: 0, stage: 'enviando' })
    try {
      const res = await withElementSet(
        set,
        (id) =>
          api.passes.export(
            { set_id: id, site, passes: refs, formats, rate_s: rate, summary: selected },
            setProgress,
            ctrl.signal,
          ),
        updateSetId,
      )
      setResult(res)
      startDownload(res.url, res.file_name)
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Gerar arquivos de rastreio
        </Text>
        <Text size="sm" c="dimmed">
          {plural(selected.length, 'passagem selecionada', 'passagens selecionadas')} · {fmtNum(seconds)} s de trajetória.
          Os arquivos têm o formato e os nomes do app antigo, com H0 no nome (os sistemas de rastreio dependem disso).
        </Text>
        <Group gap="md">
          <Checkbox label=".trn 1 Hz (ENU)" checked={formats.trn} onChange={(e) => setFormats({ ...formats, trn: e.currentTarget.checked })} />
          <Checkbox label=".trj 1 Hz" checked={formats.trj} onChange={(e) => setFormats({ ...formats, trj: e.currentTarget.checked })} />
          <Checkbox
            label="CSV completo 1 Hz"
            checked={formats.data_csv}
            onChange={(e) => setFormats({ ...formats, data_csv: e.currentTarget.checked })}
          />
          <Checkbox
            label=".trn na taxa do radar"
            checked={formats.trn_rate}
            onChange={(e) => setFormats({ ...formats, trn_rate: e.currentTarget.checked })}
          />
        </Group>
        <Group align="flex-end" gap="md">
          <NumberInput
            label="Amostragem do radar (s)"
            description={`${fmtNum(1 / rate, rate < 0.1 ? 0 : 2)} Hz`}
            value={rate}
            onChange={(v) => setRate(Number(v) || 0.01)}
            min={0.001}
            max={10}
            decimalScale={4}
            disabled={!formats.trn_rate}
            w={200}
          />
          <Checkbox
            label="Só o trecho detectável pelo radar"
            description={radar ? undefined : 'Requer um radar na busca'}
            disabled={!radar}
            checked={onlyDetectable}
            onChange={(e) => setOnlyDetectable(e.currentTarget.checked)}
            mb={6}
          />
        </Group>
        {conflicts > 0 && (
          <Alert color="orange" variant="light">
            Há {plural(conflicts, 'passagem selecionada', 'passagens selecionadas')} em conflito no tempo. Os arquivos são
            gerados assim mesmo; use “Resolver conflitos” se o sensor só pode rastrear uma por vez.
          </Alert>
        )}
        {limit != null && points > limit && (
          <Alert color="red" variant="light">
            ~{fmtNum(points / 1e6, 1)} milhões de pontos; o limite deste servidor é {fmtNum(limit / 1e6)} milhões.
            Escolha menos passagens ou uma amostragem maior.
          </Alert>
        )}
        <Group>
          <Button
            leftSection={<IconFileZip size={16} />}
            onClick={run}
            disabled={!selected.length || !anyFormat || (limit != null && points > limit)}
            loading={progress != null && progress.fraction === 0}
          >
            Gerar ZIP
          </Button>
          {progress && (
            <Button variant="default" leftSection={<IconPlayerStopFilled size={14} />} onClick={() => abort.current?.abort()}>
              Cancelar
            </Button>
          )}
          {result && (
            <Anchor href={`${result.url}?name=${encodeURIComponent(result.file_name)}`} size="sm">
              <Group gap={4}>
                <IconDownload size={14} />
                {result.file_name}
              </Group>
            </Anchor>
          )}
        </Group>
        {progress && (
          <Stack gap={4}>
            <Progress value={progress.fraction * 100} animated />
            <Text size="xs" c="dimmed">
              {progress.stage}
            </Text>
          </Stack>
        )}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
      </Stack>
    </Card>
  )
}
