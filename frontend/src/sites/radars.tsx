import { ActionIcon, Alert, Button, Group, Modal, NumberInput, ScrollArea, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconBroadcast, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import type { Radar } from '../api/types'
import { useAllRadars, useUserRadars } from './radarStore'

const FIELDS: { key: keyof Omit<Radar, 'name'>; label: string; digits: number }[] = [
  { key: 'pt', label: 'Potência (dB)', digits: 1 },
  { key: 'gt', label: 'Ganho TX (dB)', digits: 1 },
  { key: 'gr', label: 'Ganho RX (dB)', digits: 1 },
  { key: 'lt', label: 'Perda TX (dB)', digits: 1 },
  { key: 'lr', label: 'Perda RX (dB)', digits: 1 },
  { key: 'fhz', label: 'Frequência (MHz)', digits: 1 },
  { key: 'sr', label: 'Sensibilidade (dB)', digits: 1 },
  { key: 'snr', label: 'SNR exigida (dB)', digits: 1 },
  { key: 'spt', label: 'Amostragem (s)', digits: 3 },
]

const EMPTY: Radar = { name: '', pt: 60, gt: 42, gr: 42, lt: 1.4, lr: 1.6, fhz: 5400, sr: -140, snr: 0, spt: 0.01 }

export function RadarSelect({ value, onChange }: { value: Radar | null; onChange: (r: Radar | null) => void }) {
  const all = useAllRadars()
  return (
    <Select
      label="Radar"
      description="Para a margem de detecção (opcional)"
      placeholder="Sem radar"
      data={all.map((a) => ({ value: a.radar.name, label: a.origin === 'servidor' ? `${a.radar.name} (servidor)` : a.radar.name }))}
      value={value?.name ?? null}
      onChange={(name) => onChange(all.find((a) => a.radar.name === name)?.radar ?? null)}
      clearable
    />
  )
}

export function RadarsManager() {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <Button variant="default" size="compact-sm" leftSection={<IconBroadcast size={14} />} onClick={() => setOpened(true)}>
        Radares
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Radares" size="xl">
        <RadarsEditor />
      </Modal>
    </>
  )
}

function RadarsEditor() {
  const [user, setUser] = useUserRadars()
  const all = useAllRadars()
  const [form, setForm] = useState<Radar>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const name = form.name.trim()
    if (!name) return setError('Informe o nome.')
    if (all.some((a) => a.radar.name === name)) return setError('Já existe um radar com esse nome.')
    if (FIELDS.some((f) => !Number.isFinite(form[f.key])) || form.fhz <= 0 || form.spt <= 0) {
      return setError('Preencha todos os parâmetros (frequência e amostragem positivas).')
    }
    setUser([...user, { ...form, name }])
    setForm(EMPTY)
    setError(null)
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Parâmetros da equação do radar, como no app antigo (confRadar.csv). Os seus radares ficam só neste navegador.
      </Text>
      <ScrollArea type="auto">
        <Table fz="xs" striped style={{ whiteSpace: 'nowrap' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              {FIELDS.map((f) => (
                <Table.Th key={f.key} ta="right">
                  {f.label}
                </Table.Th>
              ))}
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {all.map(({ radar, origin }) => (
              <Table.Tr key={radar.name}>
                <Table.Td>
                  {radar.name}
                  {origin === 'servidor' && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · servidor
                    </Text>
                  )}
                </Table.Td>
                {FIELDS.map((f) => (
                  <Table.Td key={f.key} ta="right">
                    {radar[f.key]}
                  </Table.Td>
                ))}
                <Table.Td>
                  {origin === 'usuario' && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Excluir ${radar.name}`}
                      onClick={() => setUser(user.filter((u) => u.name !== radar.name))}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group align="flex-end" gap="xs" wrap="wrap">
        <TextInput label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} w={140} />
        {FIELDS.map((f) => (
          <NumberInput
            key={f.key}
            label={f.label}
            value={form[f.key]}
            onChange={(v) => setForm({ ...form, [f.key]: Number(v) })}
            decimalScale={f.digits}
            w={120}
          />
        ))}
        <Button onClick={add}>Adicionar</Button>
      </Group>
      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Stack>
  )
}
