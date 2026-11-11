import {
  Alert,
  Anchor,
  Autocomplete,
  Button,
  Checkbox,
  FileButton,
  Group,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFileUpload } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, useMeta } from '../../api/client'
import type { CelestrakKind, ElementSet, SpaceTrackRequest } from '../../api/types'
import { applyElementSet } from '../../elements/store'
import { readCsvFile } from '../../lib/csv'
import { plural } from '../../lib/format'

type Source = 'celestrak' | 'spacetrack' | 'file'

// Grupos do Celestrak mais usados (a lista completa está em celestrak.org/NORAD/elements)
const GROUPS = [
  'stations',
  'visual',
  'active',
  'last-30-days',
  'analyst',
  'starlink',
  'oneweb',
  'gnss',
  'weather',
  'resource',
  'cubesat',
  'science',
  'geo',
  'cosmos-1408-debris',
  'fengyun-1c-debris',
  'iridium-33-debris',
  'cosmos-2251-debris',
]

const KINDS: { value: CelestrakKind; label: string; placeholder: string }[] = [
  { value: 'catnr', label: 'NORAD_CAT_ID', placeholder: '25544, 48274' },
  { value: 'group', label: 'Grupo', placeholder: 'stations' },
  { value: 'name', label: 'Nome', placeholder: 'ISS (ZARYA)' },
  { value: 'intdes', label: 'Designador internacional', placeholder: '1998-067' },
]

function parseIds(text: string): number[] {
  const parts = text.split(/[\s,;]+/).filter(Boolean)
  const bad = parts.find((p) => !/^\d+$/.test(p))
  if (bad) throw new Error(`NORAD_CAT_ID inválido: ${bad}`)
  return [...new Set(parts.map(Number))]
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export function SourcePanel() {
  const meta = useMeta()
  const limits = meta.data?.limits
  const [source, setSource] = useState<Source>('celestrak')
  const [merge, setMerge] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [kind, setKind] = useState<CelestrakKind>('catnr')
  const [value, setValue] = useState('25544')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<SpaceTrackRequest['mode']>('latest')
  const [idsText, setIdsText] = useState('')
  const [useAppList, setUseAppList] = useState(false)
  // Padrão do app antigo: de 4 dias atrás até amanhã
  const [epochStart, setEpochStart] = useState(() => isoDate(new Date(Date.now() - 4 * 86400e3)))
  const [epochEnd, setEpochEnd] = useState(() => isoDate(new Date(Date.now() + 86400e3)))

  const mutation = useMutation({
    mutationFn: async (fetcher: () => Promise<ElementSet>) => applyElementSet(await fetcher(), merge),
    onSuccess: (set) =>
      notifications.show({ color: 'teal', message: `${plural(set.records.length, 'conjunto')} de elementos carregados.` }),
  })

  const run = (fetcher: () => Promise<ElementSet>) => {
    setError(null)
    mutation.mutate(fetcher)
  }

  const fetchCelestrak = () => {
    try {
      const values = kind === 'catnr' ? parseIds(value).map(String) : [value.trim()]
      if (!values.length || !values[0]) throw new Error('Informe o valor da consulta.')
      run(() => api.elements.celestrak(kind, values))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const fetchSpaceTrack = () => {
    try {
      if (!username || !password) throw new Error('Informe usuário e senha do Space-Track.')
      const ids = mode === 'leo' ? [] : parseIds(idsText)
      run(() =>
        api.elements.spacetrack({
          username,
          password,
          mode,
          norad_ids: ids,
          use_app_list: mode !== 'leo' && useAppList,
          epoch_start: mode === 'history' ? epochStart : null,
          epoch_end: mode === 'history' ? epochEnd : null,
        }),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const loadIdsCsv = async (file: File | null) => {
    if (!file) return
    try {
      const t = await readCsvFile(file)
      if (!t.columns.includes('NORAD_CAT_ID')) throw new Error('O CSV precisa da coluna NORAD_CAT_ID.')
      setIdsText(t.rows.map((r) => r.NORAD_CAT_ID).join(', '))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const kindSpec = KINDS.find((k) => k.value === kind)!
  const shownError = error ?? (mutation.error ? (mutation.error as Error).message : null)

  return (
    <Stack gap="md">
      <SegmentedControl
        value={source}
        onChange={(v) => setSource(v as Source)}
        data={[
          { value: 'celestrak', label: 'Celestrak' },
          { value: 'spacetrack', label: 'Space-Track' },
          { value: 'file', label: 'Arquivo' },
        ]}
        fullWidth
      />

      {source === 'celestrak' && (
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Público, sem conta. Elementos atuais (GP).
          </Text>
          <Select
            label="Consulta por"
            data={KINDS}
            value={kind}
            onChange={(v) => {
              const k = (v as CelestrakKind) ?? 'catnr'
              setKind(k)
              setValue(k === 'catnr' ? '25544' : k === 'group' ? 'stations' : '')
            }}
            allowDeselect={false}
          />
          {kind === 'group' ? (
            <Autocomplete label="Grupo" data={GROUPS} value={value} onChange={setValue} placeholder="stations" />
          ) : (
            <TextInput
              label={kindSpec.label}
              description={kind === 'catnr' ? `Até ${limits?.max_celestrak_ids ?? 100}, separados por vírgula` : undefined}
              placeholder={kindSpec.placeholder}
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
            />
          )}
          <Button onClick={fetchCelestrak} loading={mutation.isPending}>
            Buscar no Celestrak
          </Button>
        </Stack>
      )}

      {source === 'spacetrack' && (
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Requer cadastro em{' '}
            <Anchor href="https://www.space-track.org/auth/createAccount" target="_blank" size="xs">
              space-track.org
            </Anchor>
            . A senha vai só nesta consulta e não é guardada; mesmo assim, não use a senha de outros serviços.
          </Text>
          <TextInput label="Usuário" value={username} onChange={(e) => setUsername(e.currentTarget.value)} autoComplete="username" />
          <PasswordInput label="Senha" value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" />
          <Select
            label="Consulta"
            data={[
              { value: 'latest', label: 'Últimos elementos de uma lista' },
              { value: 'leo', label: 'Filtro LEO (RCS grande, perigeu < 500 km)' },
              { value: 'history', label: 'Histórico (para comparação)' },
            ]}
            value={mode}
            onChange={(v) => setMode((v as SpaceTrackRequest['mode']) ?? 'latest')}
            allowDeselect={false}
          />
          {mode !== 'leo' && (
            <>
              <Textarea
                label="NORAD_CAT_ID"
                description={`Até ${limits?.max_spacetrack_ids ?? 650}, separados por vírgula`}
                value={idsText}
                onChange={(e) => setIdsText(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={6}
              />
              <Group justify="space-between">
                <Checkbox
                  label="Somar a lista do app (~220 LEO)"
                  checked={useAppList}
                  onChange={(e) => setUseAppList(e.currentTarget.checked)}
                />
                <FileButton onChange={loadIdsCsv} accept=".csv,text/csv">
                  {(props) => (
                    <Button {...props} size="compact-xs" variant="subtle" leftSection={<IconFileUpload size={14} />}>
                      CSV
                    </Button>
                  )}
                </FileButton>
              </Group>
            </>
          )}
          {mode === 'history' && (
            <Group grow>
              <TextInput type="date" label="Época de" value={epochStart} onChange={(e) => setEpochStart(e.currentTarget.value)} />
              <TextInput type="date" label="até" value={epochEnd} onChange={(e) => setEpochEnd(e.currentTarget.value)} />
            </Group>
          )}
          <Button onClick={fetchSpaceTrack} loading={mutation.isPending}>
            Buscar no Space-Track
          </Button>
        </Stack>
      )}

      {source === 'file' && (
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            OMM em CSV, JSON ou XML (como o Celestrak e o Space-Track exportam) ou TLE de 2 ou 3 linhas.
          </Text>
          <FileButton onChange={(f) => f && run(() => api.elements.parse(f))} accept=".csv,.json,.xml,.tle,.txt,.3le">
            {(props) => (
              <Button {...props} leftSection={<IconFileUpload size={16} />} loading={mutation.isPending}>
                Escolher arquivo
              </Button>
            )}
          </FileButton>
        </Stack>
      )}

      <Checkbox
        label="Juntar ao conjunto atual"
        description="Para comparar épocas, ou combinar fontes"
        checked={merge}
        onChange={(e) => setMerge(e.currentTarget.checked)}
      />

      {shownError && (
        <Alert color="red" variant="light" withCloseButton onClose={() => (setError(null), mutation.reset())}>
          {shownError}
        </Alert>
      )}
    </Stack>
  )
}
